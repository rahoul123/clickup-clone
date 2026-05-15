import { useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  Calendar as CalendarIcon,
  Flag,
  CornerDownLeft,
  Search,
  Check,
  ChevronDown,
  Ban,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import type { TaskPriority } from '@/types';
import { PRIORITY_CONFIG } from '@/types';
import { cn } from '@/lib/utils';
import { DatePickerPanel, parseYmd, ymdToIso } from './DatePickerPanel';

interface InlineTaskComposerProps {
  memberOptions: { id: string; label: string }[];
  currentUserId?: string;
  onSave: (payload: {
    title: string;
    priority: TaskPriority;
    assigneeIds: string[];
    startDate?: string;
    endDate?: string;
  }) => void;
  onCancel: () => void;
}

const PRIORITY_FLAG_CLASS: Record<TaskPriority, string> = {
  urgent: 'text-red-500 fill-red-500',
  high: 'text-amber-500 fill-amber-500',
  normal: 'text-blue-500 fill-blue-500',
  low: 'text-slate-400 fill-slate-400',
};

export function InlineTaskComposer({ memberOptions, currentUserId, onSave, onCancel }: InlineTaskComposerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Only the per-section popovers (assignee / dates / priority) should close on
  // an outside click. The composer itself stays open until the user explicitly
  // hits Save, the × button, or Escape — never lose work on a stray click.
  const [openSection, setOpenSection] = useState<'assignee' | 'dates' | 'priority' | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  // Keyboard navigation inside the assignee list — points at the row that
  // Enter will toggle. Reset whenever the visible filter or open state
  // changes so the highlight always starts on a real entry.
  const [assigneeHighlight, setAssigneeHighlight] = useState(0);
  const assigneeListRef = useRef<HTMLDivElement>(null);

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

  const filteredMembers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    const base = q ? memberOptions.filter((m) => m.label.toLowerCase().includes(q)) : memberOptions;
    return [...base].sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return 0;
    });
  }, [assigneeSearch, memberOptions, currentUserId]);

  const visibleMembers = filteredMembers.length > 0 ? filteredMembers : memberOptions;

  // Snap the highlight back to the top whenever the visible set changes or
  // the picker re-opens, so the keyboard always starts on a real row.
  useEffect(() => {
    if (openSection !== 'assignee') return;
    setAssigneeHighlight(0);
  }, [openSection, assigneeSearch, visibleMembers.length]);

  // Keep the highlighted row scrolled into view as the user arrows past the
  // bottom / top of the visible window.
  useEffect(() => {
    if (openSection !== 'assignee') return;
    const list = assigneeListRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-assignee-idx="${assigneeHighlight}"]`);
    if (node) {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [openSection, assigneeHighlight]);

  const onAssigneeSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visibleMembers.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAssigneeHighlight((prev) => (prev + 1) % visibleMembers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAssigneeHighlight((prev) => (prev - 1 + visibleMembers.length) % visibleMembers.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = visibleMembers[assigneeHighlight];
      if (target) toggleAssignee(target.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpenSection(null);
    }
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    // Lift YMD + HH:mm into ISO so the time portion survives the trip to the
    // backend. When no time was picked we keep the bare YMD string so the
    // server stores midnight-local (preserving the legacy "date only" feel).
    const startOut = startDate ? (startTime ? ymdToIso(startDate, startTime) : startDate) : undefined;
    const endOut = endDate ? (endTime ? ymdToIso(endDate, endTime) : endDate) : undefined;
    onSave({
      title: t,
      priority,
      assigneeIds,
      startDate: startOut ?? undefined,
      endDate: endOut ?? undefined,
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

  // Date / time state is fully owned by the shared DatePickerPanel below.
  // What you see in the dates section's trigger label is derived directly
  // from the same `startDate` / `endDate` strings.

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
                  onKeyDown={onAssigneeSearchKeyDown}
                  placeholder="Search or enter email..."
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
                  autoFocus
                />
              </div>
              <div ref={assigneeListRef} className="max-h-[min(280px,45vh)] overflow-y-auto py-1.5">
                {visibleMembers.map((m, idx) => {
                  const selected = assigneeIds.includes(m.id);
                  const isMe = m.id === currentUserId;
                  const isHighlighted = idx === assigneeHighlight;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      data-assignee-idx={idx}
                      onClick={() => toggleAssignee(m.id)}
                      onMouseEnter={() => setAssigneeHighlight(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition',
                        isHighlighted
                          ? 'bg-muted ring-1 ring-inset ring-primary/40'
                          : selected
                            ? 'bg-primary/10'
                            : 'hover:bg-muted/50',
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
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {isMe ? 'Me' : m.label}
                      </span>
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
            <div className="absolute left-0 top-full z-[80] mt-1.5 rounded-xl border border-border/80 bg-popover p-2 shadow-xl">
              <DatePickerPanel
                value={{ startDate, endDate, startTime, endTime }}
                onChange={(next) => {
                  setStartDate(next.startDate);
                  setEndDate(next.endDate);
                  setStartTime(next.startTime);
                  setEndTime(next.endTime);
                }}
                onComplete={() => setOpenSection(null)}
              />
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

