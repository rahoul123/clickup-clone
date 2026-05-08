import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert TSV or pipe-markdown table text to an HTML string Tiptap can insert. */
function tableTextToHtml(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // TSV (from Excel / Google Sheets)
  if (trimmed.includes('\t')) {
    const rows = trimmed.split(/\r?\n/).filter((l) => l.trim()).map((l) =>
      l.split('\t').map((c) => c.trim()),
    );
    if (rows.length === 0) return null;
    return buildHtmlTable(rows);
  }

  // HTML clipboard with <table>
  // (Handled natively by Tiptap, so we skip here)

  // Pipe-formatted markdown table
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

/** Convert pipe-markdown content to Tiptap-compatible HTML (for legacy descriptions). */
export function pipeMarkdownToTiptapHtml(text: string): string {
  if (!text?.trim()) return '';
  // If already HTML, return as-is
  if (text.trimStart().startsWith('<')) return text;
  const html = tableTextToHtml(text);
  if (html) return html;
  // Plain text → wrap each line in <p>
  return text
    .split(/\r?\n/)
    .map((l) => (l.trim() ? `<p>${escHtml(l)}</p>` : '<p></p>'))
    .join('');
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DescriptionEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function DescriptionEditor({
  content,
  onChange,
  placeholder = 'Add description, or write with AI',
  className = '',
}: DescriptionEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const lastContentRef = useRef<string>(content);

  const initialHtml = pipeMarkdownToTiptapHtml(content);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml || '<p></p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Treat "<p></p>" as empty string so we don't store noise
      const value = html === '<p></p>' ? '' : html;
      lastContentRef.current = value;
      onChange(value);
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[80px] p-2 text-sm text-gray-800 dark:text-slate-200 leading-relaxed',
      },
      handlePaste(_view, event) {
        const ed = editorRef.current;
        if (!ed) return false;

        const htmlData = event.clipboardData?.getData('text/html') ?? '';
        const textData = event.clipboardData?.getData('text/plain') ?? '';

        // Let Tiptap handle native HTML table paste (it does this well)
        if (htmlData.includes('<table')) return false;

        // TSV or pipe-markdown table
        const tableHtml = tableTextToHtml(textData);
        if (tableHtml) {
          event.preventDefault();
          ed.commands.insertContent(tableHtml);
          return true;
        }

        return false;
      },
    },
  });

  // Keep ref in sync
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync content when it changes externally (e.g. task switch)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const newHtml = pipeMarkdownToTiptapHtml(content);
    // Only update if the content is truly different to avoid cursor jumps
    if (newHtml !== lastContentRef.current && newHtml !== editor.getHTML()) {
      editor.commands.setContent(newHtml || '<p></p>', { emitUpdate: false });
      lastContentRef.current = newHtml;
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700 focus-within:border-purple-400 focus-within:ring-1 focus-within:ring-purple-100 transition-colors overflow-x-auto description-editor ${className}`}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
