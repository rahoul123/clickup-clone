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
  Layers,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Task, TaskStatus } from '@/types';
import { getKanbanColumnThemeForKey, isBuiltinTaskStatus } from '@/types';
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
import { useTheme } from '@/contexts/ThemeContext';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(168, 85, 247, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const HEADER_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Target,
  hold: PauseCircle,
  revision: RefreshCw,
  complete: CheckCircle2,
};

interface BoardColumnProps {
  /** Built-in status key or `custom_*` id. */
  columnKey: string;
  /** Display title (custom label or default). */
  columnTitle: string;
  accentColor?: string;
  tasks: Task[];
  onAddTask: (columnKey: string) => void;
  onTaskClick: (task: Task) => void;
  onDropTask: (taskId: string, nextStatus: string) => void;
  onDeleteTask: (taskId: string) => void;
  assigneeNameById?: Record<string, string>;
  /** Map of parentTaskId → subtasks, so cards can render expandable subtask lists. */
  subtasksByParentId?: Record<string, Task[]>;
  canCreateTask?: boolean;
  /** Admin: column menu (rename / reorder board) */
  canManageKanban?: boolean;
  onRenameColumn?: () => void;
  onReorderColumns?: () => void;
  canDeleteColumn?: boolean;
  onDeleteColumn?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Inline quick composer (column “Add Task”) — full modal is separate */
  inlineComposer?: ReactNode;
}

export function BoardColumn({
  columnKey,
  columnTitle,
  accentColor,
  tasks,
  onAddTask,
  onTaskClick,
  onDropTask,
  onDeleteTask,
  assigneeNameById = {},
  subtasksByParentId = {},
  canCreateTask = true,
  canManageKanban = false,
  onRenameColumn,
  onReorderColumns,
  canDeleteColumn = false,
  onDeleteColumn,
  isCollapsed = false,
  onToggleCollapse,
  inlineComposer,
}: BoardColumnProps) {
  const theme = getKanbanColumnThemeForKey(columnKey);
  const HeaderIcon = isBuiltinTaskStatus(columnKey) ? HEADER_ICONS[columnKey] : Layers;
  const [isOver, setIsOver] = useState(false);
  const isCustom = !isBuiltinTaskStatus(columnKey);
  const customColor = accentColor || '#A855F7';
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-[280px] max-w-[320px] flex-1 flex-col rounded-xl border p-3 shadow-sm transition-all',
        theme.surface,
        theme.surfaceBorder,
        isOver && theme.dragOver
      )}
      style={
        isCustom
          ? {
              background: isDark
                ? `linear-gradient(to bottom, ${hexToRgba(customColor, 0.22)}, ${hexToRgba(customColor, 0.08)})`
                : `linear-gradient(to bottom, ${hexToRgba(customColor, 0.12)}, ${hexToRgba(customColor, 0.06)})`,
              borderColor: hexToRgba(customColor, isDark ? 0.5 : 0.35),
            }
          : undefined
      }
      onDragOver={(e) => {
        e.preventDefault();
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        setIsOver(false);
        const taskId = e.dataTransfer.getData('text/task-id');
        if (!taskId) return;
        onDropTask(taskId, columnKey);
      }}
    >
      {/* Colorful pill header */}
      <div className="mb-3 flex items-center gap-1.5">
        <div
          className={cn(
            'inline-flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 py-1.5',
            theme.headerPill
          )}
          style={
            isCustom
              ? {
                  backgroundColor: customColor,
                  color: '#FFFFFF',
                  boxShadow: `0 10px 20px ${hexToRgba(customColor, 0.28)}`,
                }
              : undefined
          }
        >
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
              theme.iconCircle
            )}
          >
            <HeaderIcon
              className={cn('h-4 w-4', isCustom ? 'text-white' : theme.iconClass)}
              strokeWidth={2.2}
            />
          </span>
          <span className={cn('truncate text-[11px] font-bold uppercase tracking-wide', isCustom ? 'text-white' : theme.titleClass)}>
            {columnTitle}
          </span>
          {accentColor ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/70"
              style={{ backgroundColor: accentColor }}
            />
          ) : null}
          <span
            className={cn('ml-auto min-w-[1.35rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums', isCustom ? 'bg-white/25 text-white' : theme.countClass)}
          >
            {tasks.length}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                theme.metaBtn,
                'shrink-0 rounded-md bg-white/80 p-1.5 text-foreground shadow-sm transition-colors hover:bg-white hover:text-foreground dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
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
            {canDeleteColumn ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteColumn?.()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete group
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onToggleCollapse?.()}>
              {isCollapsed ? <ChevronsRight className="mr-2 h-4 w-4" /> : <ChevronsLeft className="mr-2 h-4 w-4" />}
              {isCollapsed ? 'Expand group' : 'Collapse group'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className={cn(
            theme.metaBtn,
            'shrink-0 rounded-md bg-white/80 p-1.5 text-foreground shadow-sm transition-colors hover:bg-white hover:text-foreground dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800'
          )}
          aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
          onClick={() => onToggleCollapse?.()}
        >
          {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          data-add-task-column
          className={cn(
            theme.metaBtn,
            'shrink-0 rounded-md bg-white/80 p-1.5 text-foreground shadow-sm transition-colors hover:bg-white hover:text-foreground disabled:opacity-40 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800'
          )}
          onClick={() => onAddTask(columnKey)}
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
              subtasks={subtasksByParentId[task.id] ?? []}
              onSubtaskClick={(sub) => onTaskClick(sub)}
              onDeleteSubtask={(id) => onDeleteTask(id)}
            />
          ))}
        </div>

        {inlineComposer}

        <button
          type="button"
          data-add-task-column
          onClick={() => onAddTask(columnKey)}
          disabled={!canCreateTask}
          className={cn(
            'flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
            theme.addTask
          )}
          style={
            isCustom
              ? {
                  color: isDark ? hexToRgba(customColor, 0.95) : customColor,
                  border: `1px solid ${hexToRgba(customColor, isDark ? 0.55 : 0.35)}`,
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : '#FFFFFF',
                }
              : undefined
          }
        >
          <Plus className="h-4 w-4 shrink-0" />
          Add Task
        </button>
      </div>
    </div>
  );
}
