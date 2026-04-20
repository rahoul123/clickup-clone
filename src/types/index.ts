export type TaskStatus = 'todo' | 'in_progress' | 'hold' | 'revision' | 'complete';
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type AppRole = 'admin' | 'manager' | 'team_lead' | 'employee' | 'guest';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  department?: string;
  logo_url?: string;
  created_by: string;
  created_at: string;
}

export interface ReminderAttachment {
  filename: string;
  mimeType: string;
  dataUrl: string;
}

export interface Reminder {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  /** ISO date-time string for the moment the reminder fires. */
  dueDate: string | null;
  status: 'pending' | 'done' | 'cancelled';
  createdBy: string;
  notifyUserIds: string[];
  attachments?: ReminderAttachment[];
  preDayNotifiedAt?: string | null;
  dueDayNotifiedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Notification {
  id: string;
  taskId?: string | null;
  workspaceId: string;
  type: 'task_created' | 'task_status_changed' | 'reminder_pre_day' | 'reminder_due';
  message: string;
  read: boolean;
  createdAt: string;
}

export interface WorkspaceDoc {
  id: string;
  workspace_id: string;
  title: string;
  category: 'sop' | 'policy' | 'guideline' | 'other';
  file_name?: string | null;
  file_type?: string | null;
  file_data_url?: string | null;
  notes?: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export interface WorkspaceMember {
  user_id: string;
  workspace_id: string;
}

export interface UserRole {
  user_id: string;
  workspace_id: string;
  role: AppRole;
}

export interface Space {
  id: string;
  workspace_id: string;
  name: string;
  department?: string | null;
  color: string;
  is_private: boolean;
  created_by?: string;
  created_at: string;
  /** Department spaces point to the master "Team Space" folder. */
  parent_space_id?: string | null;
  /** Workspace root folder that groups all department spaces. */
  is_master_team_space?: boolean;
}

export interface Folder {
  id: string;
  space_id: string;
  name: string;
  is_private: boolean;
  created_at: string;
}

export interface List {
  id: string;
  folder_id?: string | null;
  space_id: string;
  name: string;
  created_by?: string;
  created_at: string;
  /** True for the cross-team shared list under a department-main space. */
  is_shared_main_list?: boolean;
  /** Admin / TL / Manager: column order (built-in statuses + custom_* ids). */
  kanban_column_order?: string[] | null;
  /** Optional display label overrides per column key. */
  kanban_column_labels?: Partial<Record<string, string>>;
  /** Extra columns created for this list (task status = id). */
  kanban_custom_columns?: Array<{ id: string; label: string; color?: string }>;
}

/** Default Kanban column order when a list has no saved order. */
export const DEFAULT_KANBAN_COLUMN_ORDER: TaskStatus[] = [
  'todo',
  'in_progress',
  'hold',
  'revision',
  'complete',
];

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** Optional per-item assignees — rendered as avatar chips next to the item. */
  assignee_ids?: string[];
}

export interface Task {
  id: string;
  list_id: string;
  title: string;
  description?: string;
  /** Built-in workflow status or a list-specific `custom_*` column id. */
  status: TaskStatus | string;
  priority: TaskPriority;
  assignee_ids: string[];
  start_date?: string;
  due_date?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Null for top-level tasks; otherwise the parent task id this task belongs to. */
  parent_task_id?: string | null;
  /** Inline checklist items attached to this task. */
  checklist?: ChecklistItem[];
  /** Other task ids explicitly linked from this task. */
  related_task_ids?: string[];
  /**
   * Task-level access controls (managed from the Share dialog). The server still enforces
   * workspace RBAC; these let the UI reason about "who has what on this task".
   */
  default_permission?: TaskPermission;
  collaborators?: TaskCollaborator[];
  is_private?: boolean;
}

/** Per-task access levels exposed in the Share dialog. */
export type TaskPermission = 'full_edit' | 'edit' | 'comment' | 'view';

export interface TaskCollaborator {
  user_id: string;
  role: TaskPermission;
  added_at?: string;
}

export const TASK_PERMISSION_OPTIONS: Array<{
  value: TaskPermission;
  label: string;
  description: string;
}> = [
  { value: 'full_edit', label: 'Full edit', description: 'Can edit and delete.' },
  { value: 'edit', label: 'Edit', description: "Can't create subtasks and delete." },
  { value: 'comment', label: 'Comment', description: 'Assignees can reassign and edit status.' },
  { value: 'view', label: 'View only', description: "Can't comment or edit." },
];

/** Task row on Home inbox (all accessible team spaces). */
export interface HomeTask extends Task {
  workspace_id?: string;
  workspace_name?: string;
  space_name?: string;
  list_name?: string;
  creator_label?: string;
  assignee_labels?: string[];
  comment_count?: number;
}

export interface DashboardMonthStat {
  monthIndex: number;
  month: string;
  total: number;
  completed: number;
  todo: number;
  in_progress: number;
  hold: number;
  revision: number;
}

export interface DashboardMemberPerformance {
  user_id: string;
  user_name: string;
  total: number;
  completed: number;
  completion_rate: number;
}

export interface DashboardAnalytics {
  scope: 'self' | 'team' | 'organization';
  viewerRole: AppRole;
  summary: {
    total_tasks: number;
    completed_tasks: number;
    completion_rate: number;
    in_progress_tasks: number;
    overdue_open_tasks: number;
    due_soon_tasks: number;
  };
  monthly: DashboardMonthStat[];
  statusBreakdown: Record<TaskStatus, number>;
  priorityBreakdown: Record<TaskPriority, number>;
  currentUserPerformance: DashboardMemberPerformance;
  teamPerformance: DashboardMemberPerformance[];
  spaceMonthly: Array<{
    workspace_id: string | null;
    workspace_name: string;
    space_id: string | null;
    space_name: string;
    monthly: Array<{
      monthIndex: number;
      month: string;
      total: number;
      completed: number;
    }>;
  }>;
}

export interface CommentAttachment {
  filename: string;
  mimeType: string;
  dataUrl: string;
}

export interface CommentReaction {
  emoji: string;
  user_id: string;
  user_name?: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  attachments?: CommentAttachment[];
  created_at: string;
  /** When set, this comment is a threaded reply to the referenced comment. */
  parent_comment_id?: string | null;
  /** Emoji reactions (one entry per (emoji, user) pair). */
  reactions?: CommentReaction[];
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; colorClass: string; bgClass: string }> = {
  todo: { label: 'TO DO', colorClass: 'text-todo', bgClass: 'bg-todo' },
  in_progress: { label: 'IN PROGRESS', colorClass: 'text-in-progress', bgClass: 'bg-in-progress' },
  hold: { label: 'HOLD', colorClass: 'text-hold', bgClass: 'bg-hold' },
  revision: { label: 'REVISION', colorClass: 'text-revision', bgClass: 'bg-revision' },
  complete: { label: 'COMPLETE', colorClass: 'text-complete', bgClass: 'bg-complete' },
};

/** Full-color Kanban column chrome (tinted column + pill header + Add Task button). */
export type KanbanColumnTheme = {
  surface: string;
  surfaceBorder: string;
  headerPill: string;
  iconCircle: string;
  iconClass: string;
  titleClass: string;
  countClass: string;
  metaBtn: string;
  addTask: string;
  dragOver: string;
};

export const KANBAN_COLUMN_THEME: Record<TaskStatus, KanbanColumnTheme> = {
  todo: {
    surface:
      'bg-gradient-to-b from-slate-100/95 via-slate-50/90 to-slate-100/50 dark:from-slate-800/70 dark:via-slate-800/50 dark:to-slate-900/40',
    surfaceBorder: 'border-slate-200/80 dark:border-slate-700/60',
    headerPill: 'bg-slate-300/95 text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100',
    iconCircle:
      'bg-white text-slate-700 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600/60',
    iconClass: 'text-slate-700 dark:text-slate-200',
    titleClass: 'text-slate-900 dark:text-slate-100',
    countClass: 'bg-white/50 text-slate-800 dark:bg-slate-900/60 dark:text-slate-100',
    metaBtn:
      'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60 rounded-md',
    addTask:
      'bg-white/95 text-slate-800 border border-slate-200/90 shadow-sm hover:bg-white hover:shadow-md hover:border-slate-300/90 dark:bg-slate-800/80 dark:text-slate-100 dark:border-slate-700/70 dark:hover:bg-slate-800',
    dragOver: 'ring-2 ring-slate-400/50 ring-offset-2 ring-offset-slate-50 dark:ring-slate-500/60 dark:ring-offset-slate-900',
  },
  in_progress: {
    surface:
      'bg-gradient-to-b from-sky-100/95 via-blue-50/85 to-sky-50/40 dark:from-sky-900/40 dark:via-blue-950/35 dark:to-slate-900/40',
    surfaceBorder: 'border-sky-200/70 dark:border-sky-800/50',
    headerPill: 'bg-blue-500 text-white shadow-md shadow-blue-500/25 dark:bg-blue-600 dark:shadow-blue-900/40',
    iconCircle: 'bg-white/25 text-white ring-1 ring-white/30',
    iconClass: 'text-white',
    titleClass: 'text-white',
    countClass: 'bg-white/20 text-white',
    metaBtn: 'text-white/95 hover:bg-white/20 rounded-md',
    addTask:
      'bg-white text-blue-600 border border-blue-200/90 shadow-sm hover:bg-blue-50 hover:shadow-md dark:bg-slate-800/80 dark:text-blue-300 dark:border-blue-800/60 dark:hover:bg-slate-800',
    dragOver: 'ring-2 ring-blue-400/60 ring-offset-2 ring-offset-blue-50/80 dark:ring-blue-500/60 dark:ring-offset-slate-900',
  },
  hold: {
    surface:
      'bg-gradient-to-b from-rose-100/90 via-red-50/80 to-rose-50/35 dark:from-rose-950/45 dark:via-red-950/35 dark:to-slate-900/40',
    surfaceBorder: 'border-rose-200/70 dark:border-rose-900/50',
    headerPill: 'bg-red-600 text-white shadow-md shadow-red-600/25 dark:bg-red-600 dark:shadow-red-950/50',
    iconCircle: 'bg-white/25 text-white ring-1 ring-white/30',
    iconClass: 'text-white',
    titleClass: 'text-white',
    countClass: 'bg-white/20 text-white',
    metaBtn: 'text-white/95 hover:bg-white/20 rounded-md',
    addTask:
      'bg-white text-red-700 border border-red-200/90 shadow-sm hover:bg-red-50 hover:shadow-md dark:bg-slate-800/80 dark:text-red-300 dark:border-red-900/60 dark:hover:bg-slate-800',
    dragOver: 'ring-2 ring-red-400/55 ring-offset-2 ring-offset-rose-50/80 dark:ring-red-500/60 dark:ring-offset-slate-900',
  },
  revision: {
    surface:
      'bg-gradient-to-b from-fuchsia-100/90 via-pink-50/85 to-fuchsia-50/35 dark:from-fuchsia-950/45 dark:via-pink-950/35 dark:to-slate-900/40',
    surfaceBorder: 'border-fuchsia-200/65 dark:border-fuchsia-900/50',
    headerPill: 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/25 dark:bg-fuchsia-600 dark:shadow-fuchsia-950/50',
    iconCircle: 'bg-white/25 text-white ring-1 ring-white/30',
    iconClass: 'text-white',
    titleClass: 'text-white',
    countClass: 'bg-white/20 text-white',
    metaBtn: 'text-white/95 hover:bg-white/20 rounded-md',
    addTask:
      'bg-white text-fuchsia-700 border border-fuchsia-200/90 shadow-sm hover:bg-fuchsia-50 hover:shadow-md dark:bg-slate-800/80 dark:text-fuchsia-300 dark:border-fuchsia-900/60 dark:hover:bg-slate-800',
    dragOver: 'ring-2 ring-fuchsia-400/55 ring-offset-2 ring-offset-fuchsia-50/80 dark:ring-fuchsia-500/60 dark:ring-offset-slate-900',
  },
  complete: {
    surface:
      'bg-gradient-to-b from-emerald-100/90 via-green-50/85 to-emerald-50/35 dark:from-emerald-950/45 dark:via-green-950/35 dark:to-slate-900/40',
    surfaceBorder: 'border-emerald-200/70 dark:border-emerald-900/50',
    headerPill: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-600 dark:shadow-emerald-950/50',
    iconCircle: 'bg-white/25 text-white ring-1 ring-white/30',
    iconClass: 'text-white',
    titleClass: 'text-white',
    countClass: 'bg-white/20 text-white',
    metaBtn: 'text-white/95 hover:bg-white/20 rounded-md',
    addTask:
      'bg-white text-emerald-700 border border-emerald-200/90 shadow-sm hover:bg-emerald-50 hover:shadow-md dark:bg-slate-800/80 dark:text-emerald-300 dark:border-emerald-900/60 dark:hover:bg-slate-800',
    dragOver: 'ring-2 ring-emerald-400/55 ring-offset-2 ring-offset-emerald-50/80 dark:ring-emerald-500/60 dark:ring-offset-slate-900',
  },
};

export function isBuiltinTaskStatus(s: string): s is TaskStatus {
  return (Object.keys(STATUS_CONFIG) as TaskStatus[]).includes(s as TaskStatus);
}

/** Theming for a column key: built-in uses its palette; custom columns reuse the revision theme. */
export function getKanbanColumnThemeForKey(columnKey: string): KanbanColumnTheme {
  if (isBuiltinTaskStatus(columnKey)) return KANBAN_COLUMN_THEME[columnKey];
  return KANBAN_COLUMN_THEME.revision;
}

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; colorClass: string; icon: string }> = {
  urgent: { label: 'Urgent', colorClass: 'text-urgent', icon: '🔴' },
  high: { label: 'High', colorClass: 'text-high', icon: '🟠' },
  normal: { label: 'Normal', colorClass: 'text-normal', icon: '🔵' },
  low: { label: 'Low', colorClass: 'text-low', icon: '⚪' },
};
