import { useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  BellRing,
  CheckCircle2,
  Inbox,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { Notification } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface NotificationsPanelProps {
  notifications: Notification[];
  loading: boolean;
  onMarkRead: (id: string) => void | Promise<void>;
  onOpenTask?: (taskId: string) => void;
  /** Optional bulk-read handler; if omitted we fall back to calling onMarkRead per unread item. */
  onMarkAllRead?: () => void | Promise<void>;
}

type FilterMode = 'all' | 'unread' | 'read';

const PAGE_SIZE = 12;

export function NotificationsPanel({
  notifications,
  loading,
  onMarkRead,
  onOpenTask,
  onMarkAllRead,
}: NotificationsPanelProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const readCount = notifications.length - unreadCount;

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'read') return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const handleFilterChange = (next: FilterMode) => {
    setFilter(next);
    setPage(1);
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      if (onMarkAllRead) {
        await onMarkAllRead();
      } else {
        const unread = notifications.filter((n) => !n.read);
        for (const n of unread) {
          await onMarkRead(n.id);
        }
      }
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-background via-background to-primary/[0.05] p-6">
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <Card className="flex h-full min-h-0 flex-col border-border/60 bg-card/80 backdrop-blur-md shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.45)]">
          {/* Header */}
          <CardHeader className="shrink-0 pb-4">
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
              <BellRing className="h-3.5 w-3.5" />
              Notifications
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-tight">Activity Center</CardTitle>
                <CardDescription className="mt-1">
                  Task create / update alerts from your team spaces.
                </CardDescription>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-right shadow-sm">
                <p className="text-[11px] text-muted-foreground">Unread</p>
                <p className="text-lg font-semibold text-foreground">{unreadCount}</p>
              </div>
            </div>

            {/* Filter tabs + bulk action */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-border/70 bg-background p-0.5 text-sm">
                {([
                  { id: 'all', label: 'All', count: notifications.length },
                  { id: 'unread', label: 'Unread', count: unreadCount },
                  { id: 'read', label: 'Read', count: readCount },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleFilterChange(tab.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                      filter === tab.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        'inline-flex items-center justify-center min-w-[20px] h-4 rounded-full px-1.5 text-[10px] font-semibold',
                        filter === tab.id
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0 || markingAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Mark all as read
              </button>
            </div>
          </CardHeader>

          {/* List — scrollable inner area */}
          <CardContent className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading notifications…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/80 p-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {filter === 'unread'
                    ? 'No unread notifications'
                    : filter === 'read'
                    ? 'No read notifications yet'
                    : 'No notifications yet'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {filter === 'unread'
                    ? 'You are all caught up! 🎉'
                    : 'New team updates will appear here.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {pageItems.map((item) => {
                  const isOverdue = item.type === 'task_overdue';
                  const isDueSoon = item.type === 'task_due_soon';
                  return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        'group w-full rounded-2xl border px-3.5 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-18px_hsl(var(--foreground)/0.45)]',
                        item.read
                          ? 'border-border/60 bg-background/70 hover:bg-muted/50'
                          : isOverdue
                          ? 'border-red-300/60 bg-red-50/60 shadow-sm hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                          : isDueSoon
                          ? 'border-amber-300/60 bg-amber-50/60 shadow-sm hover:bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                          : 'border-primary/25 bg-primary/[0.07] shadow-sm hover:bg-primary/[0.11]',
                      )}
                      onClick={() => {
                        if (!item.read) onMarkRead(item.id);
                        if (item.taskId && onOpenTask) onOpenTask(item.taskId);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0',
                            item.read
                              ? 'bg-muted text-muted-foreground'
                              : isOverdue
                              ? 'bg-red-100 text-red-600 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900/70'
                              : isDueSoon
                              ? 'bg-amber-100 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900/70'
                              : 'bg-primary/12 text-primary ring-1 ring-primary/20',
                          )}
                        >
                          {item.read ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isOverdue ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : isDueSoon ? (
                            <Clock className="h-4 w-4" />
                          ) : (
                            <BellRing className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm leading-snug break-words',
                              item.read ? 'font-normal text-foreground/90' : 'font-medium text-foreground',
                            )}
                          >
                            {item.message}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!item.read && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              isOverdue
                                ? 'bg-red-600 text-white'
                                : isDueSoon
                                ? 'bg-amber-500 text-white'
                                : 'bg-primary text-primary-foreground',
                            )}
                          >
                            {isOverdue ? (
                              <AlertTriangle className="h-2.5 w-2.5" />
                            ) : isDueSoon ? (
                              <Clock className="h-2.5 w-2.5" />
                            ) : (
                              <Sparkles className="h-2.5 w-2.5" />
                            )}
                            {isOverdue ? 'overdue' : isDueSoon ? 'due soon' : 'new'}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>

          {/* Pagination footer */}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="shrink-0 border-t border-border/70 px-6 py-3 flex items-center justify-between bg-background/50">
              <p className="text-xs text-muted-foreground">
                Showing{' '}
                <span className="font-semibold text-foreground">{startIndex + 1}</span>
                {'–'}
                <span className="font-semibold text-foreground">
                  {Math.min(startIndex + PAGE_SIZE, filtered.length)}
                </span>{' '}
                of <span className="font-semibold text-foreground">{filtered.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <PageNumbers
                  current={safePage}
                  total={totalPages}
                  onChange={(p) => setPage(p)}
                />
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

/** Compact page numbers: 1 … 3 4 5 … 10 style. */
function PageNumbers({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages: Array<number | 'ellipsis-l' | 'ellipsis-r'> = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push('ellipsis-l');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('ellipsis-r');
    pages.push(total);
  }

  return (
    <div className="mx-1 flex items-center gap-0.5">
      {pages.map((p, idx) =>
        typeof p === 'number' ? (
          <button
            key={`${p}-${idx}`}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'min-w-[28px] h-7 rounded-md text-xs font-medium transition-colors px-1.5',
              p === current
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {p}
          </button>
        ) : (
          <span key={`${p}-${idx}`} className="px-1 text-xs text-muted-foreground">
            …
          </span>
        ),
      )}
    </div>
  );
}
