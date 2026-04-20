import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Users,
  LayoutGrid,
  List,
  Star,
  ChevronDown,
  ChevronUp,
  ChevronsRight,
} from 'lucide-react';
import type { Task, TaskStatus, TaskPriority } from '@/types';
import { BoardColumn } from './BoardColumn';
import { AddTaskDialog } from './AddTaskDialog';
import { InlineTaskComposer } from './InlineTaskComposer';
import { DEFAULT_KANBAN_COLUMN_ORDER, STATUS_CONFIG, PRIORITY_CONFIG, isBuiltinTaskStatus } from '@/types';
import { TaskDetailDialog } from './TaskDetailDialog';
import { DiscussionPanel } from './DiscussionPanel';
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

function resolveColumnOrder(
  order: string[] | null | undefined,
  customColumns: Array<{ id: string }>
): string[] {
  const customIds = customColumns.map((c) => c.id);
  const defaultOrd = [...DEFAULT_KANBAN_COLUMN_ORDER, ...customIds];
  if (!order || order.length < 1) {
    return defaultOrd;
  }
  const set = new Set(order);
  if (set.size !== order.length) return defaultOrd;
  const allowed = new Set([...DEFAULT_KANBAN_COLUMN_ORDER, ...customIds]);
  for (const id of customIds) {
    if (!set.has(id)) return defaultOrd;
  }
  for (const k of order) {
    if (!allowed.has(k)) {
      return defaultOrd;
    }
  }
  return [...order];
}

function columnLabelForStatus(
  columnKey: string,
  labels: Partial<Record<string, string>> | undefined,
  customColumns: Array<{ id: string; label: string }>
): string {
  const override = labels?.[columnKey]?.trim();
  if (override) return override.toUpperCase();
  if (isBuiltinTaskStatus(columnKey)) return STATUS_CONFIG[columnKey].label;
  const found = customColumns.find((c) => c.id === columnKey);
  if (found) return found.label.toUpperCase();
  return columnKey.toUpperCase();
}

interface KanbanBoardProps {
  workspaceName: string;
  spaceName: string;
  listName?: string;
  listTabs: { id: string; name: string }[];
  addTaskListOptions?: { id: string; name: string }[];
  activeListId: string | null;
  onSelectList: (listId: string) => void;
  tasks: Task[];
  memberOptions: { id: string; label: string }[];
  onCreateTask: (payload: {
    listId?: string;
    status: string;
    title: string;
    priority: TaskPriority;
    assigneeIds: string[];
    notifyOnlyUserIds?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
    attachments?: File[];
  }) => Promise<void> | void;
  onMoveTask: (taskId: string, status: string) => Promise<void> | void;
  onUpdateTask: (
    taskId: string,
    payload: {
      title?: string;
      description?: string;
      status?: string;
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
  kanbanColumnOrder?: string[] | null;
  kanbanColumnLabels?: Partial<Record<string, string>>;
  kanbanCustomColumns?: Array<{ id: string; label: string; color?: string }>;
  canManageKanban?: boolean;
  /** If set, renders a "# <name> Discussion" tab next to Board/List (space-level view only). */
  spaceDiscussionId?: string;
  spaceDiscussionName?: string;
  onUpdateKanban?: (payload: {
    kanbanColumnOrder?: string[];
    kanbanColumnLabels?: Partial<Record<string, string>>;
    addKanbanColumn?: { label: string; color?: string };
    updateKanbanCustomColumn?: { id: string; label: string; color?: string };
    deleteKanbanCustomColumn?: { id: string };
    deleteKanbanColumn?: { id: string };
  }) => Promise<void> | void;
}

const CUSTOM_COLUMN_COLOR_OPTIONS = [
  '#A855F7',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#14B8A6',
  '#6366F1',
  '#EC4899',
];

export function KanbanBoard({
  workspaceName,
  spaceName,
  listName = 'Select list',
  listTabs,
  addTaskListOptions = [],
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
  kanbanCustomColumns = [],
  canManageKanban = false,
  spaceDiscussionId,
  spaceDiscussionName,
  onUpdateKanban,
}: KanbanBoardProps) {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<'board' | 'list' | 'discussion'>('board');
  const [addTaskStatus, setAddTaskStatus] = useState<string | null>(null);
  /** Column “+ Add Task” — quick inline composer (2nd screenshot style) */
  const [inlineComposeStatus, setInlineComposeStatus] = useState<string | null>(null);
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
  const [renameStatus, setRenameStatus] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [reorderOpen, setReorderOpen] = useState(false);
  const [draftColumnOrder, setDraftColumnOrder] = useState<string[]>([...DEFAULT_KANBAN_COLUMN_ORDER]);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState<string>('#A855F7');
  const [collapsedColumnKeys, setCollapsedColumnKeys] = useState<string[]>([]);

  const columnOrder = useMemo(
    () => resolveColumnOrder(kanbanColumnOrder, kanbanCustomColumns),
    [kanbanColumnOrder, kanbanCustomColumns]
  );
  const kanbanColumnLabels = kanbanLabelsProp ?? {};

  const statusOptions = useMemo(
    () =>
      columnOrder.map((key) => ({
        value: key,
        label: columnLabelForStatus(key, kanbanColumnLabels, kanbanCustomColumns),
      })),
    [columnOrder, kanbanColumnLabels, kanbanCustomColumns]
  );

  useEffect(() => {
    setCollapsedColumnKeys((prev) => prev.filter((k) => columnOrder.includes(k)));
  }, [columnOrder]);

  const toggleColumnCollapsed = (columnKey: string) => {
    setCollapsedColumnKeys((prev) =>
      prev.includes(columnKey) ? prev.filter((k) => k !== columnKey) : [...prev, columnKey]
    );
  };

  useEffect(() => {
    if (reorderOpen) setDraftColumnOrder([...columnOrder]);
  }, [reorderOpen, columnOrder]);

  useEffect(() => {
    if (!selectedTask) return;
    const latest = tasks.find((t) => t.id === selectedTask.id);
    if (latest) setSelectedTask(latest);
  }, [tasks, selectedTask]);

  /** Header “+ Task” & list view — full modal with bell / voucher */
  const openFullAddTaskModal = (status: string = 'todo') => {
    setAddTaskStatus(status);
    setInlineComposeStatus(null);
  };

  /** Board column + / Add Task — inline composer only */
  const openColumnInlineComposer = (status: string) => {
    setInlineComposeStatus((prev) => (prev === status ? null : status));
    setAddTaskStatus(null);
  };

  const handleInlineCreate = (
    status: string,
    payload: {
      title: string;
      priority: TaskPriority;
      assigneeIds: string[];
      startDate?: string;
      endDate?: string;
    }
  ) => {
    onCreateTask({
      listId: activeListId ?? undefined,
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
    listId?: string;
    status: string;
    title: string;
    priority: TaskPriority;
    assigneeIds: string[];
    notifyOnlyUserIds?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
    attachments?: File[];
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

  const tasksByStatus = useMemo(() => {
    const acc: Record<string, Task[]> = {};
    for (const t of tasks) {
      const k = t.status;
      if (!acc[k]) acc[k] = [];
      acc[k].push(t);
    }
    return acc;
  }, [tasks]);

  const openRenameForStatus = (columnKey: string) => {
    setRenameInput(columnLabelForStatus(columnKey, kanbanColumnLabels, kanbanCustomColumns));
    setRenameStatus(columnKey);
  };

  const saveNewColumn = async () => {
    const label = newColumnName.trim();
    if (!label || !onUpdateKanban) return;
    await onUpdateKanban({ addKanbanColumn: { label, color: newColumnColor } });
    setNewColumnName('');
    setNewColumnColor('#A855F7');
    setAddColumnOpen(false);
  };

  const deleteColumn = async (columnKey: string) => {
    if (!onUpdateKanban) return;
    const label = columnLabelForStatus(columnKey, kanbanColumnLabels, kanbanCustomColumns);
    const fallback = columnOrder.find((k) => k !== columnKey);
    if (!fallback) return;
    const ok = window.confirm(
      `Delete "${label}" group? Tasks will move to ${columnLabelForStatus(
        fallback,
        kanbanColumnLabels,
        kanbanCustomColumns
      )}.`
    );
    if (!ok) return;
    await onUpdateKanban({ deleteKanbanColumn: { id: columnKey } });
    setCollapsedColumnKeys((prev) => prev.filter((k) => k !== columnKey));
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
            {spaceDiscussionId && (
              <button
                onClick={() => setActiveView('discussion')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeView === 'discussion'
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                # {spaceDiscussionName ?? spaceName} Discussion
              </button>
            )}
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
            {columnOrder.map((columnKey) => (
              collapsedColumnKeys.includes(columnKey) ? (
                <button
                  key={columnKey}
                  type="button"
                  onClick={() => toggleColumnCollapsed(columnKey)}
                  className="flex min-h-[220px] w-[52px] shrink-0 flex-col items-center justify-between rounded-xl border border-border bg-muted/40 px-1 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Expand ${columnLabelForStatus(columnKey, kanbanColumnLabels, kanbanCustomColumns)}`}
                >
                  <ChevronsRight className="h-4 w-4" />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: kanbanCustomColumns.find((c) => c.id === columnKey)?.color || '#A855F7' }}
                  />
                  <span className="writing-mode-vertical rotate-180 text-[11px] font-semibold tracking-wide [writing-mode:vertical-rl]">
                    {columnLabelForStatus(columnKey, kanbanColumnLabels, kanbanCustomColumns)}
                  </span>
                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px]">
                    {(tasksByStatus[columnKey] ?? []).length}
                  </span>
                </button>
              ) : (
                <BoardColumn
                  key={columnKey}
                  columnKey={columnKey}
                  columnTitle={columnLabelForStatus(columnKey, kanbanColumnLabels, kanbanCustomColumns)}
                  accentColor={kanbanCustomColumns.find((c) => c.id === columnKey)?.color}
                  tasks={tasksByStatus[columnKey] ?? []}
                  onAddTask={openColumnInlineComposer}
                  onTaskClick={openTaskDetails}
                  onDropTask={onMoveTask}
                  onDeleteTask={handleDeleteTask}
                  assigneeNameById={assigneeNameById}
                  canCreateTask={canCreateTask}
                  canManageKanban={canManageKanban}
                  onRenameColumn={() => openRenameForStatus(columnKey)}
                  onReorderColumns={() => setReorderOpen(true)}
                  canDeleteColumn={canManageKanban}
                  onDeleteColumn={() => void deleteColumn(columnKey)}
                  isCollapsed={false}
                  onToggleCollapse={() => toggleColumnCollapsed(columnKey)}
                  inlineComposer={
                    inlineComposeStatus === columnKey ? (
                      <InlineTaskComposer
                        memberOptions={memberOptions}
                        onSave={(payload) => handleInlineCreate(columnKey, payload)}
                        onCancel={() => setInlineComposeStatus(null)}
                      />
                    ) : null
                  }
                />
              )
            ))}
            {canManageKanban && (
              <button
                type="button"
                onClick={() => setAddColumnOpen(true)}
                className="flex h-[52px] w-[140px] shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-dashed border-border bg-background px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Add group
              </button>
            )}
          </div>
        </div>
      )}

      {activeView === 'list' && (
        <div className="flex-1 overflow-y-auto p-6">
          {columnOrder.map((columnKey) => (
            <div key={columnKey} className="mb-6 border border-border rounded-lg">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isBuiltinTaskStatus(columnKey) ? STATUS_CONFIG[columnKey].bgClass : ''
                    }`}
                    style={
                      isBuiltinTaskStatus(columnKey)
                        ? undefined
                        : { backgroundColor: kanbanCustomColumns.find((c) => c.id === columnKey)?.color || '#A855F7' }
                    }
                  />
                  <span className="text-xs font-semibold uppercase">
                    {columnLabelForStatus(columnKey, kanbanColumnLabels, kanbanCustomColumns)}
                  </span>
                  <span className="text-xs text-muted-foreground">{(tasksByStatus[columnKey] ?? []).length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => openFullAddTaskModal(columnKey)}
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
              {(tasksByStatus[columnKey] ?? []).map((task) => (
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

      {activeView === 'discussion' && spaceDiscussionId && (
        <DiscussionPanel
          spaceId={spaceDiscussionId}
          spaceName={spaceDiscussionName ?? spaceName}
          memberOptions={memberOptions}
        />
      )}

      {/* Add task dialog */}
      {addTaskStatus && (
        <AddTaskDialog
          status={addTaskStatus}
          statusOptions={statusOptions}
          listOptions={addTaskListOptions.length > 0 ? addTaskListOptions : listTabs}
          activeListId={activeListId}
          onSelectList={onSelectList}
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
          statusOptions={statusOptions}
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
                  {columnLabelForStatus(status, kanbanColumnLabels, kanbanCustomColumns)}
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

      <Dialog open={addColumnOpen} onOpenChange={setAddColumnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add group</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Only Admin, Manager, or Team Lead can add columns.
            </p>
          </DialogHeader>
          <Input
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="Column name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveNewColumn();
            }}
          />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Choose color</p>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_COLUMN_COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Choose ${color}`}
                  onClick={() => setNewColumnColor(color)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    newColumnColor === color ? 'border-foreground scale-110' : 'border-border'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddColumnOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveNewColumn()} disabled={!newColumnName.trim()}>
              Add group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
