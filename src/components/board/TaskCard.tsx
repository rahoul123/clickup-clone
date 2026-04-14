import { Calendar, Paperclip, MessageSquare, AlignLeft } from 'lucide-react';
import type { Task } from '@/types';
import { PRIORITY_CONFIG } from '@/types';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority];

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow group"
    >
      <h4 className="text-sm font-medium text-card-foreground leading-snug">{task.title}</h4>

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
                key={i}
                className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[10px] font-medium text-primary"
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>

          {task.due_date && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
