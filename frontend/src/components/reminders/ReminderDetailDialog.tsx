import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Paperclip,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Reminder } from '@/types';
import { cn } from '@/lib/utils';

interface ReminderDetailDialogProps {
  open: boolean;
  reminder: Reminder | null;
  memberLabelById?: Record<string, string>;
  onClose: () => void;
  onMarkDone?: (id: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

function formatReminderDate(iso: string | null | undefined) {
  if (!iso) return 'No due date';
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return format(date, "EEE, MMM d · h:mm a");
}

function approxSize(dataUrl: string): string {
  if (!dataUrl) return '';
  const base64 = dataUrl.split(',')[1] ?? '';
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReminderDetailDialog({
  open,
  reminder,
  memberLabelById = {},
  onClose,
  onMarkDone,
  onDelete,
}: ReminderDetailDialogProps) {
  const [busy, setBusy] = useState(false);

  const notifyLabels = useMemo(() => {
    if (!reminder) return [] as string[];
    return (reminder.notifyUserIds ?? []).map((id) => memberLabelById[id] ?? id);
  }, [reminder, memberLabelById]);

  if (!open || !reminder) return null;

  const isDone = reminder.status === 'done';

  const handleMark = async () => {
    if (!onMarkDone || busy) return;
    setBusy(true);
    try {
      await onMarkDone(reminder.id);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || busy) return;
    if (!window.confirm('Delete this reminder? This cannot be undone.')) return;
    setBusy(true);
    try {
      await onDelete(reminder.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border/70 bg-amber-50/70 px-5 py-3 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Reminder
              </div>
              <h2 className="text-base font-semibold leading-snug text-foreground">
                {reminder.title}
              </h2>
              {isDone && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Marked done
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {formatReminderDate(reminder.dueDate)}
            </span>
          </div>

          {reminder.description && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {reminder.description}
              </p>
            </div>
          )}

          {notifyLabels.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3 w-3" /> Notify
              </div>
              <div className="flex flex-wrap gap-1.5">
                {notifyLabels.map((label, idx) => (
                  <span
                    key={`${label}-${idx}`}
                    className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] text-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {reminder.attachments && reminder.attachments.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                Attachments ({reminder.attachments.length})
              </div>
              <div className="space-y-1.5">
                {reminder.attachments.map((att, idx) => (
                  <a
                    key={`${att.filename}-${idx}`}
                    href={att.dataUrl}
                    download={att.filename}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs transition-colors hover:border-border hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate text-foreground">{att.filename}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {approxSize(att.dataUrl)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-5 py-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!onDelete || busy}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Close
            </button>
            {!isDone && onMarkDone && (
              <button
                type="button"
                onClick={handleMark}
                disabled={busy}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50'
                )}
              >
                <Check className="h-3.5 w-3.5" />
                Mark done
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
