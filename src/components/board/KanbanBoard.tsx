import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Users,
  LayoutGrid,
  List,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Task, TaskStatus, TaskPriority } from '@/types';
import { BoardColumn } from './BoardColumn';
import { AddTaskDialog } from './AddTaskDialog';
import { InlineTaskComposer } from './InlineTaskComposer';
import { DEFAULT_KANBAN_COLUMN_ORDER, STATUS_CONFIG, PRIORITY_CONFIG } from '@/types';
import { TaskDetailDialog } from './TaskDetailDialog';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function resolveColumnOrder(order: TaskStatus[] | null | undefined): TaskStatus[] {
  if (!order || order.length !== DEFAULT_KANBAN_COLUMN_ORDER.length) {
    return [...DEFAULT_KANBAN_COLUMN_ORDER];
  }
  const set = new Set(order);
  if (set.size !== DEFAULT_KANBAN_COLUMN_ORDER.length) return [...DEFAULT_KANBAN_COLUMN_ORDER];
  for (const s of DEFAULT_KANBAN_COLUMN_ORDER) {
    if (!set.has(s)) return [...DEFAULT_KANBAN_COLUMN_ORDER];
  }
  return [...order];
}

function columnLabelForStatus(
  status: TaskStatus,
  labels: Partial<Record<TaskStatus, string>> | undefined
): string {
  const custom = labels?.[status]?.trim();
  if (custom) return custom.toUpperCase();
  return STATUS_CONFIG[status].label;
}

interface KanbanBoardProps {
  workspaceName: string;
  spaceName: string;
  listName?: string;
  listTabs: { id: string; name: string }[];
  activeListId: string | null;
  onSelectList: (listId: string) => void;
  tasks: Task[];
  memberOptions: { id: string; label: string }[];
  onCreateTask: (payload: {
    status: TaskStatus;
    title: string;
    priority: TaskPriority;
    assigneeIds: string[];
    notifyOnlyUserIds?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
  }) => Promise<void> | void;
  onMoveTask: (taskId: string, status: TaskStatus) => Promise<void> | void;
  onUpdateTask: (
    taskId: string,
    payload: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeIds?: string[];
      startDate?: string;
      endDate?: string;
    }
  ) => Promise<Task | void> | Task | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  canCreateTask?: boolean;
  /** When set from Home inbox, open the task detail once tasks include this id */
  taskToOpenId?: string | null;
  onConsumedTaskOpen?: () => void;
  kanbanColumnOrder?: TaskStatus[] | null;
  kanbanColumnLabels?: Partial<Record<TaskStatus, string>>;
  canManageKanban?: boolean;
  onUpdateKanban?: (payload: {
    kanbanColumnOrder?: TaskStatus[];
    kanbanColumnLabels?: Partial<Record<TaskStatus, string>>;
  }) => Promise<void> | void;
}

export function KanbanBoard({
  workspaceName,
  spaceName,
  listName = 'Select list',
  listTabs,
  activeListId,
  onSelectList,
  tasks,
  memberOptions,
  onCreateTask,
  onMoveTask,
  onUpdateTask,
  onDeleteTask,
  canCreateTask = true,
  taskToOpenId = null,
  onConsumedTaskOpen,
  kanbanColumnOrder = null,
  kanbanColumnLabels: kanbanLabelsProp,
  canManageKanban = false,
  onUpdateKanban,
}: KanbanBoardProps) {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<'board' | 'list' | 'discussion'>('board');
  const [addTaskStatus, setAddTaskStatus] = useState<TaskStatus | null>(null);
  /** Column “+ Add Task” — quick inline composer (2nd screenshot style) */
  const [inlineComposeStatus, setInlineComposeStatus] = useState<TaskStatus | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const homeOpenRef = useRef<string | null>(null);
  const [taskComments, setTaskComments] = useState<
    Array<{
      id: string;
      task_id: string;
      user_id: string;
      content: string;
      attachments?: Array<{ filename: string; mimeType: string; dataUrl: string }>;
      created_at: string;
      author_name?: string;
      read_by?: Array<{ user_id: string; name?: string; read_at?: string }>;
    }>
  >([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [renameStatus, setRenameStatus] = useState<TaskStatus | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [reorderOpen, setReorderOpen] = useState(false);
  const [draftColumnOrder, setDraftColumnOrder] = useState<TaskStatus[]>([...DEFAULT_KANBAN_COLUMN_ORDER]);

  const columnOrder = useMemo(() => resolveColumnOrder(kanbanColumnOrder), [kanbanColumnOrder]);
  const kanbanColumnLabels = kanbanLabelsProp ?? {};

  useEffect(() => {
    if (reorderOpen) setDraftColumnOrder([...columnOrder]);
  }, [reorderOpen, columnOrder]);

  useEffect(() => {
    if (!selectedTask) return;
    const latest = tasks.find((t) => t.id === selectedTask.id);
    if (latest) setSelectedTask(latest);
  }, [tasks, selectedTask]);

  /** Header “+ Task” & list view — full modal with bell / voucher */
  const openFullAddTaskModal = (status: TaskStatus = 'todo') => {
    setAddTaskStatus(status);
    setInlineComposeStatus(null);
  };

  /** Board column + / Add Task — inline composer only */
  const openColumnInlineComposer = (status: TaskStatus) => {
    setInlineComposeStatus((prev) => (prev === status ? null : status));
    setAddTaskStatus(null);
  };

  const handleInlineCreate = (
    status: TaskStatus,
    payload: {
      title: string;
      priority: TaskPriority;
      assigneeIds: string[];
      startDate?: string;
      endDate?: string;
    }
  ) => {
    onCreateTask({
      status,
      title: payload.title,
      priority: payload.priority,
      assigneeIds: payload.assigneeIds,
      startDate: payload.startDate,
      endDate: payload.endDate,
    });
    setInlineComposeStatus(null);
  };

  const assigneeNameById = useMemo(
    () => Object.fromEntries(memberOptions.map((member) => [member.id, member.label])),
    [memberOptions]
  );

  const handleCreateTask = (payload: {
    status: TaskStatus;
    title: string;
    priority: TaskPriority;
    assigneeIds: string[];
    notifyOnlyUserIds?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
  }) => {
    onCreateTask(payload);
    setAddTaskStatus(null);
  };

  const openTaskDetails = async (task: Task) => {
    setSelectedTask(task);
    setLoadingComments(true);
    try {
      const result = await api.app.taskComments(task.id);
      let next = result.comments ?? [];
      setTaskComments(next);
      if (user?.id && next.length > 0) {
        try {
          await api.app.markTaskCommentsRead(task.id, { commentIds: next.map((c) => c.id) });
          const refreshed = await api.app.taskComments(task.id);
          next = refreshed.comments ?? [];
          setTaskComments(next);
        } catch (e) {
          console.error('Failed to mark comments read', e);
        }
      }
    } catch (error) {
      console.error('Failed to fetch task comments', error);
      setTaskComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    await onDeleteTask(taskId);
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
  };

  useEffect(() => {
    if (!taskToOpenId) {
      homeOpenRef.current = null;
      return;
    }
    const found = tasks.find((t) => t.id === taskToOpenId);
    if (!found) return;
    if (homeOpenRef.current === taskToOpenId) return;
    homeOpenRef.current = taskToOpenId;
    openTaskDetails(found).finally(() => {
      onConsumedTaskOpen?.();
      homeOpenRef.current = null;
    });
  }, [taskToOpenId, tasks, onConsumedTaskOpen]);

  const sendTaskComment = async (
    content: string,
    attachments?: Array<{ filename: string; mimeType: string; dataUrl: string }>
  ) => {
    if (!selectedTask) return;
    await api.app.addTaskComment(selectedTask.id, { content, attachments });
    try {
      const refreshed = await api.app.taskComments(selectedTask.id);
      setTaskComments(refreshed.comments ?? []);
    } catch (e) {
      console.error('Failed to refresh comments', e);
    }
  };

  const tasksByStatus = DEFAULT_KANBAN_COLUMN_ORDER.reduce(
    (acc, status) => {
      acc[status] = tasks.filter((t) => t.status === status);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );

  const openRenameForStatus = (status: TaskStatus) => {
    setRenameInput(columnLabelForStatus(status, kanbanColumnLabels));
    setRenameStatus(status);
  };

  const saveRename = async () => {
    if (!renameStatus || !onUpdateKanban) return;
    await onUpdateKanban({
      kanbanColumnLabels: { [renameStatus]: renameInput.trim() },
    });
    setRenameStatus(null);
  };

  const moveDraftRow = (index: number, dir: -1 | 1) => {
    setDraftColumnOrder((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const saveColumnReorder = async () => {
    if (!onUpdateKanban) return;
    await onUpdateKanban({ kanbanColumnOrder: draftColumnOrder });
    setReorderOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>Team Space</span>
          <span>/</span>
          <span>{spaceName}</span>
          <span>/</span>
          <span>{workspaceName}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{listName || 'Select list'}</span>
          <Star className="w-4 h-4 ml-1 text-muted-foreground hover:text-warning cursor-pointer" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveView('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeView === 'board' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Board
            </button>
            <button
              onClick={() => setActiveView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeView === 'list' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setActiveView('discussion')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeView === 'discussion' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Discussion
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
              <Users className="w-4 h-4" />
              Group
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canCreateTask}
              onClick={() => openFullAddTaskModal(columnOrder[0] ?? 'todo')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Task
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pt-2">
          {listTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectList(tab.id)}
              className={`px-2.5 py-1 text-xs rounded-md border whitespace-nowrap transition-colors ${
                tab.id === activeListId
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'board' && (
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="flex min-h-0 min-w-max items-start gap-4">
            {columnOrder.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                columnTitle={columnLabelForStatus(status, kanbanColumnLabels)}
                tasks={tasksByStatus[status]}
                onAddTask={openColumnInlineComposer}
                onTaskClick={openTaskDetails}
                onDropTask={onMoveTask}
                onDeleteTask={handleDeleteTask}
                assigneeNameById={assigneeNameById}
                canCreateTask={canCreateTask}
                canManageKanban={canManageKanban}
                onRenameColumn={() => openRenameForStatus(status)}
                onReorderColumns={() => setReorderOpen(true)}
                inlineComposer={
                  inlineComposeStatus === status ? (
                    <InlineTaskComposer
                      memberOptions={memberOptions}
                      onSave={(payload) => handleInlineCreate(status, payload)}
                      onCancel={() => setInlineComposeStatus(null)}
                    />
                  ) : null
                }
              />
            ))}
          </div>
        </div>
      )}

      {activeView === 'list' && (
        <div className="flex-1 overflow-y-auto p-6">
          {columnOrder.map((status) => (
            <div key={status} className="mb-6 border border-border rounded-lg">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[status].bgClass}`} />
                  <span className="text-xs font-semibold uppercase">{columnLabelForStatus(status, kanbanColumnLabels)}</span>
                  <span className="text-xs text-muted-foreground">{tasksByStatus[status].length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => openFullAddTaskModal(status)}
                  disabled={!canCreateTask}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Add Task
                </button>
              </div>

              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs text-muted-foreground border-b border-border">
                <span>Name</span>
                <span>Assignee</span>
                <span>Due Date</span>
                <span>Priority</span>
              </div>
              {tasksByStatus[status].map((task) => (
                <div key={task.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-sm border-b border-border/60 last:border-b-0">
                  <span>{task.title}</span>
                  <span className="text-muted-foreground">{task.assignee_ids[0] ? assigneeNameById[task.assignee_ids[0]] : '-'}</span>
                  <span className="text-muted-foreground">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </span>
                  <span className="text-muted-foreground">{PRIORITY_CONFIG[task.priority].label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeView === 'discussion' && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Discussion panel coming next. Abhi board/list fully functional hai.
        </div>
      )}

      {/* Add task dialog */}
      {addTaskStatus && (
        <AddTaskDialog
          status={addTaskStatus}
          onClose={() => setAddTaskStatus(null)}
          onCreate={handleCreateTask}
          memberOptions={memberOptions}
        />
      )}

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          memberOptions={memberOptions}
          comments={taskComments}
          loadingComments={loadingComments}
          onSendComment={sendTaskComment}
          onUpdateTask={async (payload) => {
            const updated = await onUpdateTask(selectedTask.id, payload);
            if (updated) setSelectedTask(updated);
          }}
          onClose={() => setSelectedTask(null)}
        />
      )}

      <Dialog open={Boolean(renameStatus)} onOpenChange={(open) => !open && setRenameStatus(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename column</DialogTitle>
          </DialogHeader>
          <Input
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            placeholder="Column name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveRename();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameStatus(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveRename()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit column order</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Move statuses up or down. This order applies to this list only.
            </p>
          </DialogHeader>
          <ul className="max-h-[min(60vh,360px)] space-y-2 overflow-y-auto pr-1">
            {draftColumnOrder.map((status, index) => (
              <li
                key={status}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {columnLabelForStatus(status, kanbanColumnLabels)}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => moveDraftRow(index, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={index === draftColumnOrder.length - 1}
                    onClick={() => moveDraftRow(index, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReorderOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveColumnReorder()}>
              Save order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
