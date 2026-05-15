import {
  Calendar,
  AlignLeft,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronRight,
  UserCircle2,
  Flag,
  Tag,
} from 'lucide-react';
import { useState } from 'react';
import type { Task } from '@/types';
import { PRIORITY_CONFIG, isTaskOverdue } from '@/types';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onDelete?: () => void;
  assigneeNameById?: Record<string, string>;
  /** Subtasks belonging to this task — when present, an expand toggle is shown. */
  subtasks?: Task[];
  /** Open a subtask's details dialog. */
  onSubtaskClick?: (task: Task) => void;
  /** Delete a subtask from the card. */
  onDeleteSubtask?: (taskId: string) => void;
}

/**
 * Return "12:34 pm" only if the ISO timestamp has a non-midnight time.
 * Midnight (00:00 local) is treated as "no time set" — that's how we
 * stored legacy date-only tasks before the time picker existed.
 */
function formatLocalTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return null;
  const period = h >= 12 ? 'pm' : 'am';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, '0')} ${period}`;
}

function formatShortMonthDay(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Build the date range label shown on the card. Examples:
 *   "Apr 23 - Apr 29, 4:30 pm"   (both dates + time on due)
 *   "Apr 29, 4:30 pm"            (only due + time)
 *   "Apr 29"                     (only due, no time)
 *   null                         (no dates at all)
 */
function formatDateRangeLabel(startIso?: string | null, dueIso?: string | null): string | null {
  const startLabel = formatShortMonthDay(startIso);
  const dueLabel = formatShortMonthDay(dueIso);
  const dueTime = formatLocalTime(dueIso);
  if (!startLabel && !dueLabel) return null;
  let body = '';
  if (startLabel && dueLabel && startLabel !== dueLabel) {
    body = `${startLabel} - ${dueLabel}`;
  } else {
    body = dueLabel ?? startLabel ?? '';
  }
  return dueTime ? `${body}, ${dueTime}` : body;
}

export function TaskCard({
  task,
  onClick,
  onDelete,
  assigneeNameById = {},
  subtasks = [],
  onSubtaskClick,
  onDeleteSubtask,
}: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority];
  const [expanded, setExpanded] = useState(false);
  const hasSubtasks = subtasks.length > 0;
  const overdue = isTaskOverdue(task);
  const firstAssigneeId = task.assignee_ids?.[0];
  const firstAssigneeLabel = firstAssigneeId ? assigneeNameById[firstAssigneeId] ?? 'U' : null;
  const extraAssignees = Math.max(0, (task.assignee_ids?.length ?? 0) - 1);
  const dateRangeLabel = formatDateRangeLabel(task.start_date, task.due_date);

  return (
    <div className="space-y-1.5">
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
        onClick={onClick}
        className={cn(
          'bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow group overflow-hidden',
          overdue ? 'border-red-400/70 dark:border-red-500/50' : 'border-border'
        )}
      >
        {task.cover_image_url && (
          // Negative margin lets the cover image sit flush against the card
          // edges while the rest of the content keeps the standard p-3 inset.
          <div className="-mx-3 -mt-3 mb-3 relative aspect-[16/9] w-[calc(100%+1.5rem)] overflow-hidden border-b border-border bg-muted">
            <img
              src={task.cover_image_url}
              alt=""
              loading="lazy"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        <div className="relative flex items-start gap-2">
          <h4 className="flex-1 min-w-0 text-sm font-medium text-card-foreground leading-snug break-words">
            {task.title}
          </h4>
          {/*
            Hover action bar — floats at the top-right with a visible gap from
            the title (ml-2) so a long title never collides with the icons.
            Uses a solid pill so it reads cleanly over any card colour.
          */}
          <div className="pointer-events-none ml-2 -mr-1 -mt-1 hidden shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-card p-0.5 shadow-sm transition-opacity duration-150 group-hover:flex group-hover:pointer-events-auto group-hover:opacity-100 opacity-0 focus-within:flex focus-within:pointer-events-auto focus-within:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClick?.();
              }}
              aria-label="Edit task"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.();
              }}
              aria-label="Delete task"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {task.description && (
          <div className="mt-1.5">
            <AlignLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 text-muted-foreground">
          <span
            title={firstAssigneeLabel ? `${firstAssigneeLabel}${extraAssignees > 0 ? ` + ${extraAssignees} more` : ''}` : 'Unassigned'}
            className={cn(
              'relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background',
              firstAssigneeLabel
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-border text-muted-foreground'
            )}
          >
            {firstAssigneeLabel ? (
              <span className="text-[10px] font-semibold">
                {firstAssigneeLabel.slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <UserCircle2 className="h-3.5 w-3.5" />
            )}
            {extraAssignees > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full border border-card bg-muted px-1 text-[9px] font-semibold text-foreground">
                +{extraAssignees}
              </span>
            )}
          </span>

          {dateRangeLabel && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground'
              )}
              title={
                task.due_date
                  ? `${overdue ? 'Overdue — was due ' : 'Due '}${new Date(task.due_date).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : undefined
              }
            >
              <Calendar className="h-3.5 w-3.5" />
              {dateRangeLabel}
            </span>
          )}

          <span
            className={cn(
              'ml-auto text-xs font-medium px-1.5 py-0.5 rounded',
              priority.colorClass
            )}
          >
            {priority.icon} {priority.label}
          </span>
        </div>

        {hasSubtasks && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="mt-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {subtasks.length} subtask{subtasks.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {hasSubtasks && expanded && (
        <div className="pl-3 space-y-1.5 border-l-2 border-border/60 ml-2">
          {subtasks.map((sub) => (
            <SubtaskCard
              key={sub.id}
              parentTitle={task.title}
              subtask={sub}
              assigneeNameById={assigneeNameById}
              onClick={() => onSubtaskClick?.(sub)}
              onDelete={() => onDeleteSubtask?.(sub.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubtaskCard({
  parentTitle,
  subtask,
  assigneeNameById,
  onClick,
  onDelete,
}: {
  parentTitle: string;
  subtask: Task;
  assigneeNameById: Record<string, string>;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const firstAssigneeId = subtask.assignee_ids?.[0];
  const firstAssigneeLabel = firstAssigneeId ? assigneeNameById[firstAssigneeId] ?? 'U' : null;
  const subOverdue = isTaskOverdue(subtask);
  const subDateLabel = formatDateRangeLabel(subtask.start_date, subtask.due_date);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/task-id', subtask.id);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={cn(
        'bg-card border rounded-md p-2.5 cursor-pointer hover:shadow-sm transition-shadow group/sub',
        subOverdue ? 'border-red-400/70 dark:border-red-500/50' : 'border-border'
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 truncate">
        {parentTitle}
      </div>
      <div className="flex items-start justify-between gap-2">
        <h5 className="text-[13px] font-semibold text-card-foreground leading-snug truncate">
          {subtask.title}
        </h5>
        {onDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover/sub:opacity-100 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
            aria-label="Delete subtask"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-muted-foreground">
        <span
          title={firstAssigneeLabel ?? 'Unassigned'}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background',
            firstAssigneeLabel
              ? 'border-primary/30 bg-primary/15 text-primary'
              : 'border-border text-muted-foreground'
          )}
        >
          {firstAssigneeLabel ? (
            <span className="text-[9px] font-semibold">
              {firstAssigneeLabel.slice(0, 2).toUpperCase()}
            </span>
          ) : (
            <UserCircle2 className="h-3 w-3" />
          )}
        </span>

        {subDateLabel && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px]',
              subOverdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground'
            )}
            title={
              subtask.due_date
                ? `${subOverdue ? 'Overdue — was due ' : 'Due '}${new Date(subtask.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : 'No date'
            }
          >
            <Calendar className="h-3 w-3" />
            {subDateLabel}
          </span>
        )}

        <span
          title={PRIORITY_CONFIG[subtask.priority]?.label ?? 'Priority'}
          className={cn(
            'ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background',
            PRIORITY_CONFIG[subtask.priority]?.colorClass
          )}
        >
          <Flag className="h-3 w-3" />
        </span>
        <span
          title="Tags"
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background"
        >
          <Tag className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
