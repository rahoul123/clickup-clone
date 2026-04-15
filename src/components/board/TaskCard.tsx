import { Calendar, AlignLeft, Edit3, Trash2 } from 'lucide-react';
import type { Task } from '@/types';
import { PRIORITY_CONFIG } from '@/types';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onDelete?: () => void;
  assigneeNameById?: Record<string, string>;
}

export function TaskCard({ task, onClick, onDelete, assigneeNameById = {} }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority];

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow group"
    >
      <div className="relative">
        <h4 className="text-sm font-medium text-card-foreground leading-snug">{task.title}</h4>
        <div className="pointer-events-none absolute right-3 top-3 hidden items-center gap-1 rounded-full bg-card/90 p-1 shadow-sm transition-opacity duration-200 group-hover:flex group-hover:pointer-events-auto group-hover:opacity-100 opacity-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClick?.();
            }}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
            className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
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
          {/* Assignee avatars */}
          <div className="flex -space-x-1.5">
            {task.assignee_ids.slice(0, 3).map((id, i) => (
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
    </div>
  );
}
