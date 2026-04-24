import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Hash,
  Send,
  Loader2,
  Paperclip,
  Smile,
  AtSign,
  FileText,
  Image as ImageIcon,
  X,
  Trash2,
  Copy,
  CornerUpLeft,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';

interface DiscussionAttachment {
  filename: string;
  mimeType: string;
  dataUrl: string;
}

interface DiscussionMessage {
  id: string;
  space_id: string;
  user_id: string;
  content: string;
  attachments?: DiscussionAttachment[];
  created_at: string;
  author_name: string;
}

interface DiscussionPanelProps {
  spaceId: string;
  spaceName: string;
  /** Workspace members used for @mention picker. */
  memberOptions?: { id: string; label: string }[];
}

const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

const QUICK_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔',
  '👍', '👏', '🙌', '🙏', '🎉', '🔥', '✨', '🚀',
  '❤️', '💯', '✅', '❗', '❓', '⚠️', '📌', '📎',
];

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullTimestamp(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDayDivider(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

const AVATAR_PALETTE = [
  'bg-purple-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
];

function avatarColorFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Render content with simple @mention highlighting. */
function renderMessageContent(content: string) {
  const parts = content.split(/(@[\w.]+(?:\s+[\w.]+)?)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          className="font-semibold text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/15 rounded px-1"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function DiscussionPanel({ spaceId, spaceName, memberOptions = [] }: DiscussionPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCaret, setMentionCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  /* ----------------------------- data loading ---------------------------- */

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.app.listSpaceDiscussion(spaceId);
      setMessages(data.messages ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load discussion');
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
    // Poll acts as a fallback in case the websocket drops; realtime events
    // below patch the UI instantly when the connection is healthy.
    const timer = window.setInterval(loadMessages, 30000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  useRealtimeEvent<{ space_id: string; message: DiscussionMessage }>(
    'discussion:message',
    ({ space_id, message }) => {
      if (space_id !== spaceId || !message?.id) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    },
  );

  useRealtimeEvent<{ space_id: string; message_id: string }>(
    'discussion:message-deleted',
    ({ space_id, message_id }) => {
      if (space_id !== spaceId || !message_id) return;
      setMessages((prev) => prev.filter((m) => m.id !== message_id));
    },
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  /* ----------------------------- composer -------------------------------- */

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [draft, autoGrow]);

  // Close emoji popover on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const onDown = (e: MouseEvent) => {
      if (!emojiRef.current?.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showEmoji]);

  const addFiles = (files: File[]) => {
    const next: File[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast({ title: 'File too large', description: `${file.name} exceeds 4 MB` });
        continue;
      }
      next.push(file);
    }
    if (next.length > 0) {
      setPendingAttachments((prev) => [...prev, ...next]);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files) addFiles(Array.from(files));
    e.currentTarget.value = '';
  };

  const removeAttachment = (idx: number) =>
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const insertAtCaret = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setDraft((prev) => prev + text);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const detectMention = (value: string, caretPos: number) => {
    const upto = value.slice(0, caretPos);
    const match = upto.match(/@([\w.]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionCaret(caretPos);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleDraftChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    detectMention(value, e.target.selectionStart ?? value.length);
  };

  const filteredMentionMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const filtered = memberOptions.filter((m) => m.label.toLowerCase().includes(q));
    return filtered.slice(0, 6);
  }, [mentionQuery, memberOptions]);

  const applyMention = (label: string) => {
    const before = draft.slice(0, mentionCaret).replace(/@([\w.]*)$/, '');
    const after = draft.slice(mentionCaret);
    const token = `@${label.replace(/\s+/g, '')} `;
    const next = before + token + after;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        const pos = (before + token).length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleComposerKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredMentionMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentionMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMentionMembers.length) % filteredMentionMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(filteredMentionMembers[mentionIndex].label);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  /* ------------------------------ send ----------------------------------- */

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (sending) return;

    setSending(true);
    try {
      const attachmentPayloads = await Promise.all(
        pendingAttachments.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      const data = await api.app.postSpaceDiscussion(spaceId, {
        content: text,
        attachments: attachmentPayloads.length > 0 ? attachmentPayloads : undefined,
      });
      setMessages((prev) => [...prev, data.message]);
      setDraft('');
      setPendingAttachments([]);
      setMentionQuery(null);
    } catch (err) {
      toast({
        title: 'Send failed',
        description: err instanceof Error ? err.message : 'Could not send message',
      });
    } finally {
      setSending(false);
    }
  };

  /* ----------------------------- delete ---------------------------------- */

  const handleDelete = async (messageId: string) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    try {
      await api.app.deleteSpaceDiscussionMessage(spaceId, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Could not delete message',
      });
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed' });
    }
  };

  const handleReply = (msg: DiscussionMessage) => {
    const quote = msg.content
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    const prefix = quote ? `${quote}\n\n` : '';
    const mention = `@${msg.author_name.replace(/\s+/g, '')} `;
    setDraft((prev) => (prev ? `${prev}\n${prefix}${mention}` : `${prefix}${mention}`));
    textareaRef.current?.focus();
  };

  /* -------------------------- derived data ------------------------------- */

  const grouped = useMemo(() => {
    const groups: Array<{ date: string; items: DiscussionMessage[] }> = [];
    for (const msg of messages) {
      const date = new Date(msg.created_at).toDateString();
      const last = groups[groups.length - 1];
      if (last && last.date === date) last.items.push(msg);
      else groups.push({ date, items: [msg] });
    }
    return groups;
  }, [messages]);

  const uniqueAuthors = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) map.set(m.user_id, m.author_name);
    return Array.from(map.entries()).slice(0, 4);
  }, [messages]);

  /* ------------------------------ render --------------------------------- */

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Channel header */}
      <div className="border-b border-border bg-card/40 px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 flex items-center justify-center">
            <Hash className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-foreground truncate">
              {spaceName} Discussion
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              Team channel — only members of this department can read & post.
            </div>
          </div>
        </div>
        {uniqueAuthors.length > 0 && (
          <div className="hidden sm:flex items-center -space-x-2">
            {uniqueAuthors.map(([id, name]) => (
              <div
                key={id}
                title={name}
                className={`h-7 w-7 rounded-full ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-white ${avatarColorFor(id)}`}
              >
                {initialsOf(name)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading discussion…
          </div>
        )}

        {!loading && error && (
          <div className="mx-auto max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-950/30 text-purple-500 dark:text-purple-300 flex items-center justify-center mb-4">
              <Hash className="h-8 w-8" />
            </div>
            <div className="text-sm font-semibold text-foreground">Start the conversation</div>
            <div className="text-xs mt-1 text-muted-foreground max-w-sm">
              Share updates, questions, or quick notes in <span className="font-semibold">#{spaceName}</span>.
              Messages here are only visible to department members.
            </div>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.date} className="space-y-1">
            <div className="sticky top-0 z-[1] flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                {formatDayDivider(group.items[0].created_at)}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {group.items.map((msg, idx) => {
              const isSelf = msg.user_id === user?.id;
              const prev = group.items[idx - 1];
              const isStacked = Boolean(
                prev &&
                  prev.user_id === msg.user_id &&
                  new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000,
              );

              return (
                <div
                  key={msg.id}
                  className={`group relative flex items-start gap-3 rounded-lg px-2 -mx-2 py-1 hover:bg-muted/40 transition-colors ${
                    isStacked ? 'mt-0.5' : 'mt-3'
                  }`}
                >
                  {isStacked ? (
                    <div className="w-9 flex-shrink-0 text-right pr-1">
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground tabular-nums">
                        {formatTimeOnly(msg.created_at)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 text-white ${avatarColorFor(msg.user_id)}`}
                    >
                      {initialsOf(msg.author_name)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {!isStacked && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {msg.author_name}
                          {isSelf && (
                            <span className="ml-1 text-[10px] font-medium text-purple-600 dark:text-purple-300">
                              (you)
                            </span>
                          )}
                        </span>
                        <span
                          title={formatFullTimestamp(msg.created_at)}
                          className="text-[11px] text-muted-foreground"
                        >
                          {formatTimeOnly(msg.created_at)}
                        </span>
                      </div>
                    )}

                    {msg.content && (
                      <div className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
                        {renderMessageContent(msg.content)}
                      </div>
                    )}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 grid gap-2 max-w-xl">
                        {msg.attachments.map((att, i) => (
                          <div
                            key={i}
                            className="overflow-hidden rounded-lg border border-border bg-card/50"
                          >
                            {att.mimeType.startsWith('image/') ? (
                              <a href={att.dataUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={att.dataUrl}
                                  alt={att.filename}
                                  className="max-h-80 w-full object-cover"
                                />
                              </a>
                            ) : (
                              <a
                                href={att.dataUrl}
                                download={att.filename}
                                className="flex items-center gap-2 p-3 text-sm text-foreground hover:bg-muted/50 transition-colors"
                              >
                                <FileText className="h-4 w-4 text-purple-500" />
                                <span className="font-medium truncate">{att.filename}</span>
                                <span className="text-[11px] text-muted-foreground ml-auto">Download</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover action bar */}
                  <div className="absolute right-2 top-1 flex items-center gap-0.5 rounded-md border border-border bg-card shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleReply(msg)}
                      title="Reply / quote"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-l-md transition-colors"
                    >
                      <CornerUpLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.content)}
                      title="Copy text"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {isSelf && (
                      <button
                        type="button"
                        onClick={() => handleDelete(msg.id)}
                        title="Delete message"
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-r-md transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="border-t border-border bg-background px-6 py-3">
        {/* Attachment chips */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingAttachments.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="inline-flex items-center gap-1.5 max-w-[240px] rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] text-foreground"
                title={`${file.name} — ${(file.size / 1024).toFixed(1)} KB`}
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="h-3 w-3 text-purple-500 shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card focus-within:border-purple-400 dark:focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 dark:focus-within:ring-purple-500/20 transition-all overflow-visible">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleComposerKeyDown}
              onPaste={handlePaste}
              placeholder={`Message #${spaceName} — Enter to send · Shift+Enter for new line · @ to mention`}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground min-h-[40px] max-h-44 px-3 pt-2.5"
              rows={1}
            />

            {/* @mention popover */}
            {mentionQuery !== null && filteredMentionMembers.length > 0 && (
              <div className="absolute bottom-full mb-2 left-2 w-64 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl z-20">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border">
                  Mention someone
                </div>
                {filteredMentionMembers.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMention(m.label);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      i === mentionIndex
                        ? 'bg-purple-50 dark:bg-purple-500/20 text-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <span
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${avatarColorFor(m.id)}`}
                    >
                      {initialsOf(m.label)}
                    </span>
                    <span className="truncate">{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer toolbar */}
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                title="Attach file"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Attach image"
                onClick={() => imageInputRef.current?.click()}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <div className="relative" ref={emojiRef}>
                <button
                  type="button"
                  title="Insert emoji"
                  onClick={() => setShowEmoji((v) => !v)}
                  className={`p-1.5 rounded transition-colors ${
                    showEmoji
                      ? 'text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Smile className="h-4 w-4" />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-full mb-2 left-0 w-56 p-2 rounded-lg border border-border bg-popover shadow-xl z-20 grid grid-cols-8 gap-1">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          insertAtCaret(emoji);
                          setShowEmoji(false);
                        }}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-base"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                title="Mention someone"
                onClick={() => insertAtCaret('@')}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                <AtSign className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">Enter</kbd>{' '}
                to send
              </span>
              <button
                type="submit"
                disabled={(!draft.trim() && pendingAttachments.length === 0) || sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm shadow-purple-500/30"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </form>
    </div>
  );
}
