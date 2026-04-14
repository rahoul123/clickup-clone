import { Plus, MoreHorizontal } from 'lucide-react';
import type { Task, TaskStatus } from '@/types';
import { STATUS_CONFIG } from '@/types';
import { TaskCard } from './TaskCard';
import { cn } from '@/lib/utils';

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
}

export function BoardColumn({ status, tasks, onAddTask, onTaskClick }: BoardColumnProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={cn('w-2.5 h-2.5 rounded-full', config.bgClass)} />
        <span className="text-xs font-bold tracking-wide text-foreground uppercase">{config.label}</span>
        <span className="text-xs font-medium text-muted-foreground ml-1">{tasks.length}</span>
        <div className="flex-1" />
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tasks */}
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>

      {/* Add task button */}
      <button
        onClick={() => onAddTask(status)}
        className="flex items-center gap-2 mt-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Task
      </button>
    </div>
  );
}
