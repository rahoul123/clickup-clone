import { useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  Calendar as CalendarIcon,
  Flag,
  CornerDownLeft,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  Ban,
  X,
} from 'lucide-react';
import { format, addDays, nextMonday } from 'date-fns';
import type { TaskPriority } from '@/types';
import { PRIORITY_CONFIG } from '@/types';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';

interface InlineTaskComposerProps {
  memberOptions: { id: string; label: string }[];
  onSave: (payload: {
    title: string;
    priority: TaskPriority;
    assigneeIds: string[];
    startDate?: string;
    endDate?: string;
  }) => void;
  onCancel: () => void;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

const PRIORITY_FLAG_CLASS: Record<TaskPriority, string> = {
  urgent: 'text-red-500 fill-red-500',
  high: 'text-amber-500 fill-amber-500',
  normal: 'text-blue-500 fill-blue-500',
  low: 'text-slate-400 fill-slate-400',
};

export function InlineTaskComposer({ memberOptions, onSave, onCancel }: InlineTaskComposerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Only the per-section popovers (assignee / dates / priority) should close on
  // an outside click. The composer itself stays open until the user explicitly
  // hits Save, the × button, or Escape — never lose work on a stray click.
  const [openSection, setOpenSection] = useState<'assignee' | 'dates' | 'priority' | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [activeDateField, setActiveDateField] = useState<'start' | 'due'>('due');

  useEffect(() => {
    if (!openSection) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Node)) return;
      const root = rootRef.current;
      if (!root) return;
      // Click on the section trigger rows / open popover stays within rootRef;
      // only collapse when clicking truly outside the composer card.
      if (root.contains(el)) return;
      setOpenSection(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [openSection]);

  const today = useMemo(() => startOfDaySafe(new Date()), []);

  const filteredMembers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [assigneeSearch, memberOptions]);

  const visibleMembers = filteredMembers.length > 0 ? filteredMembers : memberOptions;

  const calendarSelected = useMemo(() => {
    const raw = activeDateField === 'start' ? startDate : endDate;
    return parseYmd(raw);
  }, [activeDateField, startDate, endDate]);

  const calendarMonth = calendarSelected ?? today;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onSave({
      title: t,
      priority,
      assigneeIds,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openSectionOnly = (s: 'assignee' | 'dates' | 'priority' | null) => {
    setOpenSection((prev) => (prev === s ? null : s));
  };

  const colorByIndex = (idx: number) => {
    const colors = [
      'bg-indigo-500',
      'bg-violet-600',
      'bg-blue-600',
      'bg-emerald-600',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-600',
      'bg-slate-600',
    ];
    return colors[idx % colors.length];
  };

  const applyPreset = (due: Date) => {
    setEndDate(formatYmd(due));
    setActiveDateField('due');
  };

  const presets = useMemo(() => {
    const now = today;
    const sat = (() => {
      const d = new Date(now);
      const day = d.getDay();
      if (day === 6) return startOfDaySafe(d);
      const daysUntilSat = (6 - day + 7) % 7;
      d.setDate(d.getDate() + daysUntilSat);
      return startOfDaySafe(d);
    })();

    return [
      { label: 'Today', sub: format(now, 'EEE'), date: startOfDaySafe(now) },
      { label: 'Tomorrow', sub: format(addDays(now, 1), 'EEE'), date: startOfDaySafe(addDays(now, 1)) },
      { label: 'This weekend', sub: format(sat, 'EEE'), date: sat },
      { label: 'Next week', sub: format(nextMondaySafe(now), 'EEE'), date: nextMondaySafe(now) },
      { label: '2 weeks', sub: format(addDays(now, 14), 'd MMM'), date: startOfDaySafe(addDays(now, 14)) },
      { label: '4 weeks', sub: format(addDays(now, 28), 'd MMM'), date: startOfDaySafe(addDays(now, 28)) },
    ];
  }, [today]);

  return (
    <div
      ref={rootRef}
      className="mb-3 rounded-xl border-2 border-primary/55 bg-card p-3.5 shadow-md ring-1 ring-primary/10"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      {/* Title + Save */}
      <div className="flex items-center gap-2 border-b border-border/50 pb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Task Name..."
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/80 outline-none focus:ring-0"
          autoFocus
        />
        <button
          type="button"
          disabled={!title.trim()}
          onClick={submit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/95 disabled:opacity-40"
        >
          Save
          <CornerDownLeft className="h-3.5 w-3.5 opacity-95" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          aria-label="Close"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="divide-y divide-border/40">
        {/* Add assignee */}
        <div className="relative py-0.5">
          <button
            type="button"
            onClick={() => openSectionOnly('assignee')}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg py-2.5 pl-0.5 pr-1 text-left text-[13px] transition',
              openSection === 'assignee' ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/30">
              <User className="h-4 w-4 opacity-80" />
            </span>
            <span className="font-medium">Add assignee</span>
            <span className="flex-1" />
            {assigneeIds.length > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                {assigneeIds.length}
              </span>
            )}
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-muted-foreground/70 transition', openSection === 'assignee' && 'rotate-180')}
            />
          </button>
          {openSection === 'assignee' && (
            <div className="absolute left-0 right-0 top-full z-[80] mt-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover shadow-xl">
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder="Search or enter email..."
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
                  autoFocus
                />
              </div>
              <div className="max-h-[min(280px,45vh)] overflow-y-auto py-1.5">
                {visibleMembers.map((m, idx) => {
                  const selected = assigneeIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAssignee(m.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition',
                        selected ? 'bg-primary/8' : 'hover:bg-muted/50'
                      )}
                    >
                      <span className="relative">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white shadow-sm',
                            colorByIndex(idx)
                          )}
                        >
                          {m.label.trim().charAt(0).toUpperCase() || 'U'}
                        </span>
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{m.label}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Add dates */}
        <div className="relative py-0.5">
          <button
            type="button"
            onClick={() => openSectionOnly('dates')}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg py-2.5 pl-0.5 pr-1 text-left text-[13px] transition',
              openSection === 'dates' ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/30">
              <CalendarIcon className="h-4 w-4 opacity-80" />
            </span>
            <span className="font-medium">Add dates</span>
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {endDate
                ? format(parseYmd(endDate)!, 'MMM d')
                : startDate
                  ? `${format(parseYmd(startDate)!, 'MMM d')} →`
                  : ''}
            </span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-muted-foreground/70 transition', openSection === 'dates' && 'rotate-180')}
            />
          </button>
          {openSection === 'dates' && (
            /* Anchor to the right edge of the trigger so the popover expands
               toward the center/board instead of overflowing the viewport when
               the composer sits in a narrow left-hand kanban column. */
            <div className="absolute left-0 top-full z-[80] mt-1.5 w-[min(calc(100vw-2rem),460px)] rounded-xl border border-border/80 bg-popover p-2 shadow-xl">
              {/* Read-only display chips — clicking them selects which field
                   the calendar should update. The native <input type="date">
                   was removed on purpose: it opened a second (browser-native)
                   picker that duplicated the custom calendar below. */}
              <div className="mb-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDateField('start')}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-left transition',
                    activeDateField === 'start'
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-background hover:bg-muted/40'
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Start date
                  </span>
                  <span className="block text-xs font-medium text-foreground">
                    {startDate ? format(parseYmd(startDate)!, 'MMM d, yyyy') : 'Not set'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDateField('due')}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-left transition',
                    activeDateField === 'due'
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-background hover:bg-muted/40'
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Due date
                  </span>
                  <span className="block text-xs font-medium text-foreground">
                    {endDate ? format(parseYmd(endDate)!, 'MMM d, yyyy') : 'Not set'}
                  </span>
                </button>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/15 p-1 sm:flex-row sm:items-start">
                <div className="w-full shrink-0 space-y-0 border-border/40 sm:w-[8.5rem] sm:border-r sm:pr-2">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.date)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition hover:bg-background"
                    >
                      <span className="font-medium text-foreground">{p.label}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{p.sub}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-background"
                  >
                    <span>Set recurring</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border/30 bg-background p-1">
                  <Calendar
                    mode="single"
                    defaultMonth={calendarMonth}
                    selected={calendarSelected}
                    onSelect={(d) => {
                      if (!d) return;
                      const ymd = formatYmd(d);
                      if (activeDateField === 'start') {
                        setStartDate(ymd);
                        // If start > due, or due is empty, reset due so the
                        // user is nudged to pick one; keep picker open on
                        // the "due" tab so the next click completes the range.
                        if (!endDate || ymd > endDate) setEndDate('');
                        setActiveDateField('due');
                      } else {
                        setEndDate(ymd);
                        // Due-date selection finalises the range → close.
                        setOpenSection(null);
                      }
                    }}
                    onDayDoubleClick={(d) => {
                      if (!d) return;
                      const ymd = formatYmd(d);
                      setStartDate(ymd);
                      setEndDate(ymd);
                      setActiveDateField('due');
                      setOpenSection(null);
                    }}
                    className="w-full p-1"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Add priority */}
        <div className="relative py-0.5">
          <button
            type="button"
            onClick={() => openSectionOnly('priority')}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg py-2.5 pl-0.5 pr-1 text-left text-[13px] transition',
              openSection === 'priority' ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/30">
              <Flag className={cn('h-4 w-4', PRIORITY_FLAG_CLASS[priority])} strokeWidth={2.2} />
            </span>
            <span className="font-medium">Add priority</span>
            <span className="ml-auto text-[12px] font-semibold text-foreground/90">{PRIORITY_CONFIG[priority].label}</span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-muted-foreground/70 transition', openSection === 'priority' && 'rotate-180')}
            />
          </button>
          {openSection === 'priority' && (
            <div className="absolute left-0 right-0 top-full z-[80] mt-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover py-1 shadow-xl">
              {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPriority(p);
                    setOpenSection(null);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition hover:bg-muted/50"
                >
                  <Flag className={cn('h-4 w-4 shrink-0', PRIORITY_FLAG_CLASS[p])} strokeWidth={2.2} />
                  <span className="font-medium">{PRIORITY_CONFIG[p].label}</span>
                  {priority === p && <Check className="ml-auto h-4 w-4 text-primary" />}
                </button>
              ))}
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                onClick={() => {
                  setPriority('normal');
                  setOpenSection(null);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-muted-foreground transition hover:bg-muted/50"
              >
                <Ban className="h-4 w-4 shrink-0" />
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function startOfDaySafe(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextMondaySafe(from: Date): Date {
  try {
    return startOfDaySafe(nextMonday(from, { weekStartsOn: 0 }));
  } catch {
    return startOfDaySafe(addDays(from, 7));
  }
}
