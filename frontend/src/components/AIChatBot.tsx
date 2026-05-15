import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Floating in-app AI assistant. Sits bottom-right of every authenticated
 * screen. Talks to `POST /api/chat` and can trigger server-side actions
 * (currently `CREATE_TASK`) which the backend executes against the user's
 * active list. Conversation lives in component state — it resets when the
 * tab is closed.
 */

interface AIChatBotProps {
  /** The list the user is currently looking at, if any. The assistant uses
   *  this as the default target when the user asks to create a task. */
  activeListId?: string | null;
  /** Optional workspace id (passed through for future actions). */
  activeWorkspaceId?: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Set when the server actually created a task for this turn. */
  createdTask?: {
    id: string;
    title: string;
    list_name: string;
    priority: string;
    due_date: string | null;
  } | null;
  failureReason?: string | null;
  failed?: boolean;
}

const STORAGE_KEY = 'digitech-chat-open';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Salam! Main DigitechIO Sahayak hu. Aap pooch sakte ho:\n\n• "Task kaise banau?"\n• "Naya task: landing page redesign, priority high"\n• "Notifications kaise check karu?"\n\nBolo bhai, kya help chahiye?',
};

export function AIChatBot({ activeListId = null, activeWorkspaceId = null }: AIChatBotProps) {
  const { user, loading: authLoading } = useAuth();

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'open';
  });
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Persist open/closed across page reloads so the assistant stays where the
  // user left it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  }, [open]);

  // Auto-scroll the conversation to the bottom whenever a new message or the
  // typing indicator appears.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus the input when the panel opens so the user can type immediately.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Build the wire history without the local welcome message (id === 'welcome')
    // and without our newly-added user turn — we'll add it explicitly below.
    const wireHistory = [...messages, userMsg]
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const result = await api.app.chat({
        messages: wireHistory,
        activeListId,
        activeWorkspaceId,
      });
      const botMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        createdTask: result.action?.ok && result.action.type === 'CREATE_TASK' && result.action.task
          ? {
              id: result.action.task.id,
              title: result.action.task.title,
              list_name: result.action.task.list_name,
              priority: result.action.task.priority,
              due_date: result.action.task.due_date,
            }
          : null,
        failureReason: result.action && !result.action.ok ? result.action.reason ?? null : null,
        failed: false,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'AI service abhi reply nahi de payi. Thodi der me try karo.';
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: message,
          failed: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [activeListId, activeWorkspaceId, input, messages, sending]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
  };

  const buttonLabel = useMemo(() => (open ? 'Close assistant' : 'Open AI assistant'), [open]);

  // Don't render anything until auth state is known so we don't briefly flash
  // the button on the login page.
  if (authLoading || !user) return null;

  return (
    <>
      {/* Floating launcher button — always visible bottom-right */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={buttonLabel}
        title={buttonLabel}
        className={cn(
          'fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all',
          'bg-gradient-to-br from-purple-600 via-primary to-fuchsia-600 text-white',
          'hover:scale-105 hover:shadow-purple-500/30 active:scale-95',
          open && 'ring-2 ring-purple-300 ring-offset-2 ring-offset-background',
        )}
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden />
        ) : (
          <div className="relative">
            <MessageCircle className="h-6 w-6" aria-hidden />
            <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-yellow-300" aria-hidden />
          </div>
        )}
      </button>

      {/* Expandable chat panel */}
      {open && (
        <div
          className={cn(
            'fixed bottom-24 right-6 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl',
            'h-[520px] max-h-[calc(100vh-8rem)]',
          )}
          role="dialog"
          aria-label="DigitechIO AI assistant"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-purple-600 via-primary to-fuchsia-600 px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
              <Bot className="h-5 w-5" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">DigitechIO Sahayak</p>
              <p className="text-[11px] text-white/80 leading-tight">
                Roman Urdu / English — pooch lo kuch bhi
              </p>
            </div>
            <button
              type="button"
              onClick={clearChat}
              title="Clear conversation"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-background/60 p-3 space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {sending && <TypingIndicator />}
          </div>

          {/* Composer */}
          <div className="border-t border-border bg-background p-3">
            <div className="flex items-end gap-2 rounded-xl border border-input bg-card px-2 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Bhai, message likho..."
                className="flex-1 resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground max-h-28"
                disabled={sending}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                  'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-sm',
                  'hover:from-purple-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-purple-600 disabled:hover:to-fuchsia-600',
                )}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
              Enter = send · Shift+Enter = newline
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-sm">
          <Bot className="h-4 w-4" aria-hidden />
        </div>
      )}
      <div className="flex max-w-[78%] flex-col gap-1.5">
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
            isUser
              ? 'rounded-br-md bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-sm'
              : msg.failed
                ? 'rounded-bl-md border border-destructive/30 bg-destructive/10 text-destructive'
                : 'rounded-bl-md bg-muted text-foreground',
          )}
        >
          {msg.content}
        </div>
        {msg.createdTask && (
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/70 px-2.5 py-1.5 text-[11px] text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-100">
            <span className="font-semibold">Task created:</span> {msg.createdTask.title}
            <span className="text-emerald-700/80 dark:text-emerald-200/80">
              {' '}
              · in {msg.createdTask.list_name}
              {msg.createdTask.due_date
                ? ` · due ${msg.createdTask.due_date.slice(0, 10)}`
                : ''}
            </span>
          </div>
        )}
        {msg.failureReason && (
          <div className="rounded-lg border border-amber-300/40 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-100">
            ⚠️ {msg.failureReason}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-sm">
        <Bot className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.32s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.16s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce" />
      </div>
    </div>
  );
}

export default AIChatBot;
