import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, nextMonday } from 'date-fns';
import { Calendar as CalendarIcon, ChevronRight, CornerDownLeft, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

/**
 * Shared rich date + time picker panel used by both the inline kanban
 * composer and the full Add Task dialog. Layout mirrors ClickUp:
 *
 *   [📅 4/23 ×]  [Add time]    [📅 4/29 ×]  [Add time]
 *   ─────────────────────────────────────────────────
 *   Today               Fri  │  <calendar grid>
 *   Tomorrow            Sat  │
 *   This weekend        Sat  │
 *   Next week           Mon  │
 *   2 weeks         29 May   │
 *   4 weeks         12 Jun   │
 *   Set Recurring      >     │
 *
 * Clicking "Add time" on a pill opens a vertical time-slot list anchored
 * to that pill. The component is fully controlled — caller owns the four
 * YYYY-MM-DD / HH:mm strings and patches them via `onChange`.
 */

export interface DatePickerPanelValue {
  startDate: string; // YYYY-MM-DD or ''
  endDate: string;   // YYYY-MM-DD or ''
  startTime: string; // HH:mm 24h or ''
  endTime: string;   // HH:mm 24h or ''
}

interface DatePickerPanelProps {
  value: DatePickerPanelValue;
  onChange: (next: DatePickerPanelValue) => void;
  /** Fires when the panel decides itself is "done" (e.g. due date just got
   *  picked). Lets the caller close the popover. Optional. */
  onComplete?: () => void;
  /** Hides the start-date pill entirely — useful when the host only cares
   *  about a single "due date". */
  hideStartDate?: boolean;
  className?: string;
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/**
 * Combine a YMD date + optional HH:mm time into an ISO datetime the backend
 * can parse. Defaults to midnight local when no time is given (preserves
 * the legacy date-only behaviour). Returns null for blank input.
 */
export function ymdToIso(date: string, time?: string): string | null {
  const d = parseYmd(date);
  if (!d) return null;
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d.toISOString();
}

function startOfDaySafe(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function nextMondaySafe(d: Date): Date {
  try {
    return startOfDaySafe(nextMonday(d));
  } catch {
    const fallback = new Date(d);
    fallback.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
    return startOfDaySafe(fallback);
  }
}

/** 15-minute time slots covering a full day (96 entries). */
function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

function formatTimeLabel(time: string): string {
  if (!time) return '';
  const [hh, mm] = time.split(':').map(Number);
  const period = hh >= 12 ? 'pm' : 'am';
  const display = hh % 12 === 0 ? 12 : hh % 12;
  return `${display}:${String(mm).padStart(2, '0')} ${period}`;
}

function formatPillDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return '';
  // M/D/YY — short ClickUp-style label.
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

const TIME_SLOTS = buildTimeSlots();

/** "Now-ish" suggestion shown next to the Today preset: rounds the current
 *  time up to the next 15-minute slot so a click lands on a sensible value. */
function nextQuarterHour(): { ymd: string; time: string; label: string } {
  const now = new Date();
  const ms = 15 * 60 * 1000;
  const rounded = new Date(Math.ceil(now.getTime() / ms) * ms);
  const hh = String(rounded.getHours()).padStart(2, '0');
  const mm = String(rounded.getMinutes()).padStart(2, '0');
  return {
    ymd: formatYmd(rounded),
    time: `${hh}:${mm}`,
    label: formatTimeLabel(`${hh}:${mm}`),
  };
}

export function DatePickerPanel({
  value,
  onChange,
  onComplete,
  hideStartDate = false,
  className,
}: DatePickerPanelProps) {
  const { startDate, endDate, endTime } = value;

  // Time only applies to the due date — start date is intentionally date-only.
  // Calendar focus defaults to 'due' so a single click sets the due date.
  // Clicking the start pill switches focus so the next calendar click sets
  // start instead. After start lands, focus auto-returns to due.
  const [activeField, setActiveField] = useState<'start' | 'due'>('due');
  const [timeOpen, setTimeOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the time popup when clicking outside the panel.
  useEffect(() => {
    if (!timeOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      setTimeOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [timeOpen]);

  const today = useMemo(() => startOfDaySafe(new Date()), []);
  const nowSuggestion = useMemo(() => nextQuarterHour(), []);

  const presets = useMemo(() => {
    const now = today;
    const sat = (() => {
      const d = new Date(now);
      const day = d.getDay();
      const delta = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      return startOfDaySafe(d);
    })();
    const nextSat = startOfDaySafe(addDays(sat, 7));
    return [
      { label: 'Today', sub: format(now, 'EEE'), date: startOfDaySafe(now) },
      { label: 'Later', sub: nowSuggestion.label, date: startOfDaySafe(now), time: nowSuggestion.time },
      { label: 'Tomorrow', sub: format(addDays(now, 1), 'EEE'), date: startOfDaySafe(addDays(now, 1)) },
      { label: 'This weekend', sub: format(sat, 'EEE'), date: sat },
      { label: 'Next week', sub: format(nextMondaySafe(now), 'EEE'), date: nextMondaySafe(now) },
      { label: 'Next weekend', sub: format(nextSat, 'd MMM'), date: nextSat },
      { label: '2 weeks', sub: format(addDays(now, 14), 'd MMM'), date: startOfDaySafe(addDays(now, 14)) },
      { label: '4 weeks', sub: format(addDays(now, 28), 'd MMM'), date: startOfDaySafe(addDays(now, 28)) },
    ];
  }, [today, nowSuggestion]);

  const effectiveField = hideStartDate ? 'due' : activeField;
  const calendarSelected = parseYmd(effectiveField === 'start' ? startDate : endDate);
  const calendarMonth = calendarSelected ?? today;

  const update = (patch: Partial<DatePickerPanelValue>) => {
    onChange({ ...value, ...patch });
  };

  /** Apply a preset to the due date (and optional time). */
  const applyPreset = (preset: { date: Date; time?: string }) => {
    update({ endDate: formatYmd(preset.date), endTime: preset.time ?? endTime });
    onComplete?.();
  };

  const onCalendarSelect = (d?: Date) => {
    if (!d) return;
    const ymd = formatYmd(d);
    if (hideStartDate || effectiveField === 'due') {
      update({ endDate: ymd });
      onComplete?.();
      return;
    }
    // Start-field flow: set the start, then auto-return focus to due so the
    // very next click finishes the range without an extra pill tap.
    update({ startDate: ymd, endDate: ymd > endDate ? '' : endDate });
    setActiveField('due');
  };

  const setDueTime = (time: string) => {
    update({ endTime: time });
    setTimeOpen(false);
  };

  const clearDate = (field: 'start' | 'due') => {
    if (field === 'start') update({ startDate: '', startTime: '' });
    else update({ endDate: '', endTime: '' });
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'w-[min(calc(100vw-2rem),520px)] rounded-xl border border-border bg-popover p-2.5 shadow-xl',
        className,
      )}
    >
      {/* Date pills row */}
      <div className={cn('mb-2.5 grid gap-2', hideStartDate ? 'grid-cols-1' : 'grid-cols-2')}>
        {!hideStartDate && (
          <DatePill
            field="start"
            date={startDate}
            time=""
            showTime={false}
            focused={activeField === 'start'}
            onFocus={() => setActiveField('start')}
            timeOpen={false}
            onToggleTime={() => {}}
            onClear={() => {
              clearDate('start');
              setActiveField('due');
            }}
            onPickTime={() => {}}
          />
        )}
        <DatePill
          field="due"
          date={endDate}
          time={endTime}
          showTime
          focused={activeField === 'due'}
          onFocus={() => setActiveField('due')}
          timeOpen={timeOpen}
          onToggleTime={() => setTimeOpen((prev) => !prev)}
          onClear={() => clearDate('due')}
          onPickTime={setDueTime}
        />
      </div>

      {/* Presets + calendar grid */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/15 p-1 sm:flex-row sm:items-start">
        <div className="w-full shrink-0 space-y-0 border-border/40 sm:w-[10rem] sm:border-r sm:pr-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition hover:bg-background"
            >
              <span className="font-medium text-foreground">{p.label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{p.sub}</span>
            </button>
          ))}
          <button
            type="button"
            disabled
            className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground opacity-60"
          >
            <span>Set Recurring</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border/30 bg-background p-1">
          <Calendar
            mode="single"
            defaultMonth={calendarMonth}
            selected={calendarSelected}
            onSelect={onCalendarSelect}
            onDayDoubleClick={(d) => {
              if (!d) return;
              const ymd = formatYmd(d);
              update({ startDate: hideStartDate ? '' : ymd, endDate: ymd });
              onComplete?.();
            }}
            className="w-full p-1"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Single date pill. The "Add time" button only renders for the due-date
 * variant (`showTime`) so start dates stay date-only by design. Clicking
 * the pill body switches the panel's active field — the next calendar
 * click writes into the focused pill.
 */
function DatePill({
  field,
  date,
  time,
  showTime,
  focused,
  onFocus,
  timeOpen,
  onToggleTime,
  onClear,
  onPickTime,
}: {
  field: 'start' | 'due';
  date: string;
  time: string;
  showTime: boolean;
  focused: boolean;
  onFocus: () => void;
  timeOpen: boolean;
  onToggleTime: () => void;
  onClear: () => void;
  onPickTime: (time: string) => void;
}) {
  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg border bg-background pl-2 pr-1 py-1 text-xs transition',
          date
            ? 'border-primary/40 bg-primary/5'
            : focused
              ? 'border-primary/60 ring-1 ring-primary/20'
              : 'border-dashed border-border',
        )}
      >
        <button
          type="button"
          onClick={onFocus}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {date ? (
            <span className="font-medium text-foreground tabular-nums">
              {formatPillDate(date)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {field === 'start' ? 'Start date' : 'Due date'}
            </span>
          )}
        </button>
        {date && (
          <button
            type="button"
            onClick={onClear}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Clear ${field} date`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {showTime && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={onToggleTime}
              disabled={!date}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition',
                !date && 'cursor-not-allowed text-muted-foreground/50',
                date && !time && 'text-muted-foreground hover:bg-muted hover:text-foreground',
                date && time && 'bg-primary/10 text-primary',
                timeOpen && 'bg-muted text-foreground',
              )}
            >
              {time ? formatTimeLabel(time) : 'Add time'}
            </button>
          </>
        )}
      </div>

      {showTime && timeOpen && date && (
        <div className="absolute left-0 top-full z-[90] mt-1.5 w-44 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          <TimePickerList selectedTime={time} onPick={onPickTime} />
        </div>
      )}
    </div>
  );
}

function TimePickerList({
  selectedTime,
  onPick,
}: {
  selectedTime: string;
  onPick: (time: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to roughly the current selection (or "now" if nothing picked yet)
  // when the popover opens so the user doesn't start at midnight every time.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const anchor = selectedTime || (() => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const m = Math.floor(now.getMinutes() / 15) * 15;
      return `${hh}:${String(m).padStart(2, '0')}`;
    })();
    const target = list.querySelector<HTMLElement>(`[data-slot="${anchor}"]`);
    if (target) {
      list.scrollTop = Math.max(0, target.offsetTop - list.clientHeight / 3);
    }
  }, [selectedTime]);

  return (
    <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
      {TIME_SLOTS.map((slot) => {
        const selected = slot === selectedTime;
        return (
          <button
            key={slot}
            type="button"
            data-slot={slot}
            onClick={() => onPick(slot)}
            className={cn(
              'flex w-full items-center justify-between px-3 py-1.5 text-xs transition',
              selected ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted',
            )}
          >
            <span>{formatTimeLabel(slot)}</span>
            {selected && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                Enter <CornerDownLeft className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default DatePickerPanel;
