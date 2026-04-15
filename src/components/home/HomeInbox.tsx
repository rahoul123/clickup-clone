import { useMemo, useState } from 'react';
import { format, parseISO, startOfDay, subDays } from 'date-fns';
import { CheckCircle2, Circle, Flag, MessageSquare, Settings, Filter, Inbox, Clock3, Sparkles } from 'lucide-react';
import type { HomeTask } from '@/types';
import { STATUS_CONFIG } from '@/types';
import { cn } from '@/lib/utils';

type InboxTab = 'primary' | 'other' | 'later' | 'cleared';

interface HomeInboxProps {
  tasks: HomeTask[];
  loading: boolean;
  currentUserId: string | null;
  onRefresh: () => void;
  onOpenTask: (task: HomeTask) => void;
}

function bucketForDate(date: Date, now: Date): string {
  const sod = startOfDay(now);
  const taskDay = startOfDay(date);
  if (taskDay.getTime() === sod.getTime()) return 'today';
  const weekAgo = subDays(sod, 7);
  if (taskDay >= weekAgo && taskDay < sod) return 'week';
  return format(date, 'MMMM yyyy');
}

function filterByTab(tasks: HomeTask[], tab: InboxTab, userId: string | null): HomeTask[] {
  const now = new Date();
  return tasks.filter((t) => {
    const due = t.due_date ? parseISO(t.due_date) : null;
    const isAssignee = userId ? t.assignee_ids?.includes(userId) : false;
    switch (tab) {
      case 'primary':
        return t.status !== 'complete';
      case 'other':
        return isAssignee && t.status !== 'complete';
      case 'later':
        return (
          t.status === 'hold' ||
          (due !== null && !Number.isNaN(due.getTime()) && due > now && t.status !== 'complete')
        );
      case 'cleared':
        return t.status === 'complete';
      default:
        return true;
    }
  });
}

function formatRowTime(iso: string, now: Date): string {
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (startOfDay(d).getTime() === startOfDay(now).getTime()) {
    return format(d, 'h:mm a');
  }
  if (d.getFullYear() === now.getFullYear()) {
    return format(d, 'MMM d');
  }
  return format(d, 'MMM d, yyyy');
}

export function HomeInbox({ tasks, loading, currentUserId, onRefresh, onOpenTask }: HomeInboxProps) {
  const [tab, setTab] = useState<InboxTab>('primary');
  const [filterOpen, setFilterOpen] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null);

  const spaceOptions = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((t) => {
      if (t.space_name) names.add(t.space_name);
    });
    return [...names].sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    let list = filterByTab(tasks, tab, currentUserId);
    if (spaceFilter) {
      list = list.filter((t) => t.space_name === spaceFilter);
    }
    return list;
  }, [tasks, tab, currentUserId, spaceFilter]);

  const grouped = useMemo(() => {
    const now = new Date();
    const buckets: Record<string, HomeTask[]> = {};
    for (const t of filtered) {
      const d = parseISO(t.updated_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = bucketForDate(d, now);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(t);
    }
    const order = (k: string) => {
      if (k === 'today') return 0;
      if (k === 'week') return 1;
      return 2;
    };
    const keys = Object.keys(buckets).sort((a, b) => {
      const oa = order(a);
      const ob = order(b);
      if (oa !== ob) return oa - ob;
      if (oa === 2 && ob === 2) {
        return parseISO(buckets[b][0].updated_at).getTime() - parseISO(buckets[a][0].updated_at).getTime();
      }
      return a.localeCompare(b);
    });
    return keys.map((k) => ({
      key: k,
      label:
        k === 'today'
          ? 'Today'
          : k === 'week'
            ? 'Last 7 days'
            : k,
      items: buckets[k].sort((a, b) => parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime()),
    }));
  }, [filtered]);

  const tabCounts = useMemo(() => {
    const c = (t: InboxTab) => filterByTab(tasks, t, currentUserId).length;
    return {
      primary: c('primary'),
      other: c('other'),
      later: c('later'),
      cleared: c('cleared'),
    };
  }, [tasks, currentUserId]);

  const totalOpen = tabCounts.primary + tabCounts.other + tabCounts.later;
  const now = new Date();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="relative z-30 flex-shrink-0 border-b border-border/70 bg-background">
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              <Inbox className="w-3.5 h-3.5" />
              Inbox
            </div>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight">Home</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalOpen} active tasks across accessible team spaces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
              onClick={() => onRefresh()}
              title="Refresh inbox"
            >
              <Settings className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 px-5 pb-1 pt-0.5">
          {(
            [
              ['primary', 'Primary', tabCounts.primary],
              ['other', 'Other', tabCounts.other],
              ['later', 'Later', tabCounts.later],
              ['cleared', 'Cleared', tabCounts.cleared],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1 text-[11px] text-muted-foreground/90">
                  {id === 'cleared' ? `${count}` : `${count > 99 ? '99+' : count} unread`}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mx-5 mb-2 mt-0.5 flex items-center justify-between border-t border-border/70 px-0 py-2">
          <div className="relative z-50">
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-[90] mt-1.5 w-60 rounded-xl border border-border/80 bg-popover/95 py-1.5 text-sm shadow-2xl ring-1 ring-border/60 backdrop-blur">
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left transition-colors hover:bg-muted"
                  onClick={() => {
                    setSpaceFilter(null);
                    setFilterOpen(false);
                  }}
                >
                  All spaces
                </button>
                {spaceOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="w-full truncate px-3 py-1.5 text-left transition-colors hover:bg-muted"
                    onClick={() => {
                      setSpaceFilter(name);
                      setFilterOpen(false);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3.5 h-3.5" />
              Updated by activity
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Clean inbox style
            </span>
          </div>
        </div>
      </header>

      <div className="scrollbar-thin relative z-0 flex-1 overflow-y-auto px-5 pb-4">
        {loading ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
            Loading all team tasks...
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
            No tasks in this view.
          </div>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-card">
            {grouped.map((section) => (
              <div key={section.key} className="border-b border-border/60 last:border-b-0">
                <div className="sticky top-0 z-10 bg-muted/55 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </div>
                <ul className="space-y-1.5 p-1.5">
                  {section.items.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="flex w-full gap-3 rounded-lg border border-transparent bg-background px-3.5 py-2.5 text-left transition-colors hover:border-border/70 hover:bg-muted/30"
                      >
                        <span className="flex-shrink-0 pt-0.5">
                          {task.status === 'complete' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground/50" aria-hidden />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-sm font-medium leading-snug text-foreground">{task.title}</p>
                            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                              {formatRowTime(task.updated_at, now)}
                            </span>
                          </div>

                          {task.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{task.description}</p>
                          )}

                          <p className="mt-1 text-[11px] text-muted-foreground">
                            <span className="text-foreground/90">{task.workspace_name}</span> · <span>{task.space_name}</span> ·{' '}
                            <span>{task.list_name}</span>
                          </p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {task.creator_label && (
                              <span className="rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {task.creator_label}
                                {task.assignee_labels && task.assignee_labels.length > 0
                                  ? ` -> ${task.assignee_labels.join(', ')}`
                                  : ''}
                              </span>
                            )}
                            {task.status === 'complete' && (
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                                  STATUS_CONFIG.complete.bgClass,
                                  STATUS_CONFIG.complete.colorClass
                                )}
                              >
                                {STATUS_CONFIG.complete.label}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          {(task.priority === 'urgent' || task.priority === 'high') && (
                            <Flag
                              className={cn('w-4 h-4', task.priority === 'urgent' ? 'text-red-600' : 'text-orange-500')}
                              aria-hidden
                            />
                          )}
                          {(task.comment_count ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <MessageSquare className="w-3 h-3" />
                              {task.comment_count}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
