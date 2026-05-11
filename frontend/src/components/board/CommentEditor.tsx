import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';

// ── Helpers (same as DescriptionEditor) ──────────────────────────────────────

function tableTextToHtml(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.includes('\t')) {
    const rows = trimmed
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split('\t').map((c) => c.trim()));
    if (rows.length === 0) return null;
    return buildHtmlTable(rows);
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.some((l) => l.trimStart().startsWith('|'))) {
    const isSep = (l: string) => /^\s*\|[\s\-:|]+\|\s*$/.test(l) && l.includes('-');
    const dataLines = lines.filter((l) => l.trimStart().startsWith('|') && !isSep(l));
    const rows = dataLines.map((l) =>
      l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()),
    );
    if (rows.length === 0) return null;
    return buildHtmlTable(rows);
  }

  return null;
}

function buildHtmlTable(rows: string[][]): string {
  const maxCols = Math.max(...rows.map((r) => r.length));
  const pad = (row: string[]) => Array.from({ length: maxCols }, (_, i) => row[i] ?? '');
  const header = `<tr>${pad(rows[0]).map((c) => `<th><p>${escHtml(c)}</p></th>`).join('')}</tr>`;
  const body = rows
    .slice(1)
    .map((row) => `<tr>${pad(row).map((c) => `<td><p>${escHtml(c)}</p></td>`).join('')}</tr>`)
    .join('');
  return `<table><tbody>${header}${body}</tbody></table>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface CommentEditorHandle {
  clear(): void;
  focus(): void;
  insertContent(content: string): void;
  /** Delete `charsBack` characters before cursor, then insert `content`. */
  replaceBackAndInsert(charsBack: number, content: string): void;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CommentEditorProps {
  onChange?: (html: string) => void;
  onSubmit?: () => void;
  onImagePaste?: (files: File[]) => void;
  onMentionTrigger?: () => void;
  placeholder?: string;
  className?: string;
}

export const CommentEditor = forwardRef<CommentEditorHandle, CommentEditorProps>(
  function CommentEditor(
    {
      onChange,
      onSubmit,
      onImagePaste,
      onMentionTrigger,
      placeholder = 'Write a comment...',
      className = '',
    },
    ref,
  ) {
    const editorRef = useRef<Editor | null>(null);
    const onSubmitRef = useRef(onSubmit);
    const onImagePasteRef = useRef(onImagePaste);
    const onChangeRef = useRef(onChange);
    const onMentionTriggerRef = useRef(onMentionTrigger);

    useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
    useEffect(() => { onImagePasteRef.current = onImagePaste; }, [onImagePaste]);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { onMentionTriggerRef.current = onMentionTrigger; }, [onMentionTrigger]);

    const editor = useEditor({
      extensions: [
        StarterKit,
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder }),
      ],
      content: '<p></p>',
      onUpdate: ({ editor: ed }) => {
        const html = ed.getHTML();
        const value = html === '<p></p>' ? '' : html;
        onChangeRef.current?.(value);
        // Detect inline @ typing → open mention picker
        const { from } = ed.state.selection;
        const textBefore = ed.state.doc.textBetween(Math.max(0, from - 2), from, '\n');
        if (textBefore.endsWith('@') && (textBefore.length === 1 || /[\s\n]/.test(textBefore[0]))) {
          onMentionTriggerRef.current?.();
        }
      },
      editorProps: {
        attributes: {
          class:
            'outline-none min-h-[60px] px-4 pt-3 pb-2 text-sm text-gray-800 dark:text-slate-200 leading-relaxed',
        },
        handleKeyDown(_view, event) {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmitRef.current?.();
            return true;
          }
          return false;
        },
        handlePaste(_view, event) {
          const ed = editorRef.current;
          if (!ed) return false;

          const htmlData = event.clipboardData?.getData('text/html') ?? '';
          const textData = event.clipboardData?.getData('text/plain') ?? '';

          // Let Tiptap handle native HTML table paste
          if (htmlData.includes('<table')) return false;

          // TSV or pipe-markdown → convert to Tiptap table
          const tableHtml = tableTextToHtml(textData);
          if (tableHtml) {
            event.preventDefault();
            ed.commands.insertContent(tableHtml);
            return true;
          }

          // Image files from clipboard
          const items = event.clipboardData?.items;
          if (items) {
            const imageFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
              }
            }
            if (imageFiles.length > 0) {
              event.preventDefault();
              onImagePasteRef.current?.(imageFiles);
              return true;
            }
          }

          return false;
        },
      },
    });

    useEffect(() => {
      editorRef.current = editor;
    }, [editor]);

    useImperativeHandle(ref, () => ({
      clear() {
        editorRef.current?.commands.clearContent();
        onChangeRef.current?.('');
      },
      focus() {
        editorRef.current?.commands.focus();
      },
      insertContent(content: string) {
        editorRef.current?.commands.focus();
        editorRef.current?.commands.insertContent(content);
      },
      replaceBackAndInsert(charsBack: number, content: string) {
        const ed = editorRef.current;
        if (!ed) return;
        const { from } = ed.state.selection;
        ed.chain().focus().deleteRange({ from: from - charsBack, to: from }).insertContentAt(from - charsBack, content).run();
      },
    }));

    return (
      <div className={`description-editor flex-1 min-h-0 flex flex-col overflow-y-auto ${className}`}>
        <EditorContent editor={editor} className="flex-1" />
      </div>
    );
  },
);
