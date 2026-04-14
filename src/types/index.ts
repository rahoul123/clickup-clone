export type TaskStatus = 'todo' | 'in_progress' | 'hold' | 'revision' | 'complete';
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type AppRole = 'owner' | 'admin' | 'member' | 'guest';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  created_by: string;
  created_at: string;
}

export interface Space {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  is_private: boolean;
  created_at: string;
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
  folder_id?: string;
  space_id: string;
  name: string;
  created_at: string;
}

export interface Task {
  id: string;
  list_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_ids: string[];
  due_date?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; colorClass: string; bgClass: string }> = {
  todo: { label: 'TO DO', colorClass: 'text-todo', bgClass: 'bg-todo' },
  in_progress: { label: 'IN PROGRESS', colorClass: 'text-in-progress', bgClass: 'bg-in-progress' },
  hold: { label: 'HOLD', colorClass: 'text-hold', bgClass: 'bg-hold' },
  revision: { label: 'REVISION', colorClass: 'text-revision', bgClass: 'bg-revision' },
  complete: { label: 'COMPLETE', colorClass: 'text-complete', bgClass: 'bg-complete' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; colorClass: string; icon: string }> = {
  urgent: { label: 'Urgent', colorClass: 'text-urgent', icon: '🔴' },
  high: { label: 'High', colorClass: 'text-high', icon: '🟠' },
  normal: { label: 'Normal', colorClass: 'text-normal', icon: '🔵' },
  low: { label: 'Low', colorClass: 'text-low', icon: '⚪' },
};
