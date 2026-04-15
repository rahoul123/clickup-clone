import {
  Plus,
  MoreHorizontal,
  Circle,
  Target,
  PauseCircle,
  RefreshCw,
  CheckCircle2,
  Pencil,
  ListOrdered,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Task, TaskStatus } from '@/types';
import { KANBAN_COLUMN_THEME } from '@/types';
import { TaskCard } from './TaskCard';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const HEADER_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Target,
  hold: PauseCircle,
  revision: RefreshCw,
  complete: CheckCircle2,
};

interface BoardColumnProps {
  status: TaskStatus;
  /** Display title (custom label or default). */
  columnTitle: string;
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  onDropTask: (taskId: string, nextStatus: TaskStatus) => void;
  onDeleteTask: (taskId: string) => void;
  assigneeNameById?: Record<string, string>;
  canCreateTask?: boolean;
  /** Admin: column menu (rename / reorder board) */
  canManageKanban?: boolean;
  onRenameColumn?: () => void;
  onReorderColumns?: () => void;
  /** Inline quick composer (column “Add Task”) — full modal is separate */
  inlineComposer?: ReactNode;
}

export function BoardColumn({
  status,
  columnTitle,
  tasks,
  onAddTask,
  onTaskClick,
  onDropTask,
  onDeleteTask,
  assigneeNameById = {},
  canCreateTask = true,
  canManageKanban = false,
  onRenameColumn,
  onReorderColumns,
  inlineComposer,
}: BoardColumnProps) {
  const theme = KANBAN_COLUMN_THEME[status];
  const HeaderIcon = HEADER_ICONS[status];
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-[280px] max-w-[320px] flex-1 flex-col rounded-xl border p-3 shadow-sm transition-all',
        theme.surface,
        theme.surfaceBorder,
        isOver && theme.dragOver
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        setIsOver(false);
        const taskId = e.dataTransfer.getData('text/task-id');
        if (!taskId) return;
        onDropTask(taskId, status);
      }}
    >
      {/* Colorful pill header */}
      <div className="mb-3 flex items-center gap-1.5">
        <div
          className={cn(
            'inline-flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 py-1.5',
            theme.headerPill
          )}
        >
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
              theme.iconCircle
            )}
          >
            <HeaderIcon className={cn('h-4 w-4', theme.iconClass)} strokeWidth={2.2} />
          </span>
          <span className={cn('truncate text-[11px] font-bold uppercase tracking-wide', theme.titleClass)}>
            {columnTitle}
          </span>
          <span
            className={cn(
              'ml-auto min-w-[1.35rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums',
              theme.countClass
            )}
          >
            {tasks.length}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(theme.metaBtn, 'shrink-0 p-1.5 transition-colors')}
              aria-label="Group options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Group options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canManageKanban} onSelect={() => onRenameColumn?.()}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canManageKanban} onSelect={() => onReorderColumns?.()}>
              <ListOrdered className="mr-2 h-4 w-4" />
              Edit column order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          data-add-task-column
          className={cn(theme.metaBtn, 'shrink-0 p-1.5 transition-colors disabled:opacity-40')}
          onClick={() => onAddTask(status)}
          disabled={!canCreateTask}
          aria-label="Add task"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="max-h-[min(70vh,720px)] space-y-2 overflow-y-auto scrollbar-thin pr-0.5 pb-1">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              onDelete={() => onDeleteTask(task.id)}
              assigneeNameById={assigneeNameById}
            />
          ))}
        </div>

        {inlineComposer}

        <button
          type="button"
          data-add-task-column
          onClick={() => onAddTask(status)}
          disabled={!canCreateTask}
          className={cn(
            'flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
            theme.addTask
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          Add Task
        </button>
      </div>
    </div>
  );
}
