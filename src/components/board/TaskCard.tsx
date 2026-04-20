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
import { PRIORITY_CONFIG } from '@/types';
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

  return (
    <div className="space-y-1.5">
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
        onClick={onClick}
        className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow group"
      >
        <div className="relative flex items-start gap-2">
          <h4 className="flex-1 min-w-0 text-sm font-medium text-card-foreground leading-snug break-words">
            {task.title}
          </h4>
          {/*
            Hover action bar — floats at the top-right of the card with a visible
            gap from the title (ml-2) so a long title never collides with the
            icons. Uses a solid pill so it reads cleanly over any card colour.
          */}
          <div className="pointer-events-none ml-2 -mr-1 -mt-1 hidden shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-card p-0.5 shadow-sm transition-opacity duration-150 group-hover:flex group-hover:pointer-events-auto group-hover:opacity-100 opacity-0">
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

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {task.assignee_ids.slice(0, 3).map((id) => (
                <div
                  key={id}
                  title={assigneeNameById[id] ?? 'Unassigned'}
                  className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[10px] font-medium text-primary"
                >
                  {(assigneeNameById[id] ?? 'U').slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>

            {(task.start_date || task.due_date) && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {task.start_date
                  ? new Date(task.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'N/A'}
                {' - '}
                {task.due_date
                  ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'N/A'}
              </span>
            )}
          </div>

          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', priority.colorClass)}>
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
      className="bg-card border border-border rounded-md p-2.5 cursor-pointer hover:shadow-sm transition-shadow group/sub"
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

      <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
        <span
          title={firstAssigneeLabel ?? 'Assignee'}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background"
        >
          {firstAssigneeLabel ? (
            <span className="text-[9px] font-medium text-foreground">
              {firstAssigneeLabel.slice(0, 2).toUpperCase()}
            </span>
          ) : (
            <UserCircle2 className="h-3 w-3" />
          )}
        </span>
        <span
          title={
            subtask.due_date
              ? new Date(subtask.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'No date'
          }
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background"
        >
          <Calendar className="h-3 w-3" />
        </span>
        <span
          title={PRIORITY_CONFIG[subtask.priority]?.label ?? 'Priority'}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background',
            PRIORITY_CONFIG[subtask.priority]?.colorClass
          )}
        >
          <Flag className="h-3 w-3" />
        </span>
        <span
          title="Tags"
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background"
        >
          <Tag className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
