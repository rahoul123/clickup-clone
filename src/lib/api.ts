const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data?.message || 'Request failed', response.status);
  }
  return data;
}

export const api = {
  public: {
    departments: () => request('/public/departments'),
  },
  auth: {
    me: () => request('/auth/me'),
    signup: (payload: { email: string; password: string; displayName: string; department?: string }) =>
      request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
    login: (payload: { email: string; password: string }) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    forgotPassword: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (password: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ password }) }),
  },
  app: {
    bootstrap: () => request('/app/bootstrap'),
    homeTasks: () => request('/app/home-tasks'),
    dashboardAnalytics: (workspaceId?: string | null) =>
      request(`/app/dashboard-analytics${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
    listTasks: (listId: string) => request(`/lists/${listId}/tasks`),
    createWorkspace: (name: string, department: string) =>
      request('/workspaces', { method: 'POST', body: JSON.stringify({ name, department }) }),
    createSpace: (workspaceId: string, name: string, department?: string) =>
      request('/spaces', { method: 'POST', body: JSON.stringify({ workspaceId, name, department }) }),
    deleteSpace: (spaceId: string) => request(`/spaces/${spaceId}`, { method: 'DELETE' }),
    createList: (
      spaceId: string,
      name: string,
      access?: { isRestricted: boolean; allowedUserIds: string[] }
    ) =>
      request('/lists', {
        method: 'POST',
        body: JSON.stringify({
          spaceId,
          name,
          ...(access ? { isRestricted: access.isRestricted, allowedUserIds: access.allowedUserIds } : {}),
        }),
      }),
    updateListAccess: (
      listId: string,
      payload: { isRestricted: boolean; allowedUserIds: string[] }
    ) =>
      request(`/lists/${listId}/access`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteList: (listId: string) => request(`/lists/${listId}`, { method: 'DELETE' }),
    updateListDetails: (
      listId: string,
      payload: {
        name?: string;
        color?: string | null;
        icon?: string | null;
        description?: string | null;
        defaultTaskType?:
          | 'task'
          | 'milestone'
          | 'form_response'
          | 'meeting_note'
          | 'process'
          | 'project';
      }
    ) => request(`/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    duplicateList: (listId: string) =>
      request(`/lists/${listId}/duplicate`, { method: 'POST' }),
    reorderLists: (spaceId: string, orderedListIds: string[]) =>
      request('/lists/reorder', {
        method: 'POST',
        body: JSON.stringify({ spaceId, orderedListIds }),
      }),
    archiveList: (listId: string) =>
      request(`/lists/${listId}/archive`, { method: 'POST' }),
    unarchiveList: (listId: string) =>
      request(`/lists/${listId}/unarchive`, { method: 'POST' }),
    getArchivedLists: (spaceId: string) =>
      request(`/spaces/${spaceId}/archived-lists`),
    favoriteList: (listId: string) =>
      request(`/lists/${listId}/favorite`, { method: 'POST' }),
    unfavoriteList: (listId: string) =>
      request(`/lists/${listId}/favorite`, { method: 'DELETE' }),
    updateListKanban: (
      listId: string,
      payload: {
        kanbanColumnOrder?: string[];
        kanbanColumnLabels?: Record<string, string>;
        addKanbanColumn?: { label: string; color?: string };
        updateKanbanCustomColumn?: { id: string; label: string; color?: string };
        deleteKanbanCustomColumn?: { id: string };
        deleteKanbanColumn?: { id: string };
      }
    ) => request(`/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    inviteMember: (
      workspaceId: string,
      email: string,
      role: 'employee' | 'team_lead' | 'manager' | 'admin',
      department: string
    ) => request(`/workspaces/${workspaceId}/invite`, { method: 'POST', body: JSON.stringify({ email, role, department }) }),
    updateMemberRole: (workspaceId: string, memberId: string, role: 'employee' | 'team_lead' | 'manager' | 'admin') =>
      request(`/workspaces/${workspaceId}/members/${memberId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    createTask: (payload: {
      listId: string;
      title: string;
      status: string;
      priority: string;
      /** Task assignees (shown on card / TaskAssignee). */
      assigneeIds: string[];
      /** Bell / voucher: notify only — not assigned unless also in assigneeIds. */
      notifyOnlyUserIds?: string[];
      startDate?: string;
      endDate?: string;
      description?: string;
      /** Optional parent task id — creates a subtask of an existing task. */
      parentTaskId?: string;
    }) => request('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
    moveTask: (taskId: string, status: string) =>
      request(`/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    updateTask: (
      taskId: string,
      payload: {
        title?: string;
        description?: string;
        status?: string;
        priority?: string;
        assigneeIds?: string[];
        startDate?: string;
        endDate?: string;
        checklist?: Array<{ id?: string; text: string; done: boolean; assigneeIds?: string[] }>;
        relatedTaskIds?: string[];
        /** Fallback access level applied to non-collaborators. */
        defaultPermission?: 'full_edit' | 'edit' | 'comment' | 'view';
        /** Full replacement of the task's explicit collaborator list. */
        collaborators?: Array<{
          userId: string;
          role: 'full_edit' | 'edit' | 'comment' | 'view';
        }>;
        /** Toggle "Make private" on the task. */
        isPrivate?: boolean;
      }
    ) => request(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    searchTasks: (workspaceId: string, query: string, excludeTaskId?: string) => {
      const params = new URLSearchParams({ q: query });
      if (excludeTaskId) params.set('exclude', excludeTaskId);
      return request(`/workspaces/${workspaceId}/tasks-search?${params.toString()}`);
    },
    deleteTask: (taskId: string) => request(`/tasks/${taskId}`, { method: 'DELETE' }),
    getTask: (taskId: string) => request(`/tasks/${taskId}`),
    taskComments: (taskId: string) => request(`/tasks/${taskId}/comments`),
    addTaskComment: (
      taskId: string,
      payload: {
        content: string;
        attachments?: Array<{ filename: string; mimeType: string; dataUrl: string }>;
        /** When provided, the new comment becomes a threaded reply under this comment. */
        parentCommentId?: string;
      }
    ) => request(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
    markTaskCommentsRead: (taskId: string, payload: { commentIds: string[] }) =>
      request(`/tasks/${taskId}/comments/mark-read`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    /** Toggle an emoji reaction on a comment for the current user. */
    toggleCommentReaction: (taskId: string, commentId: string, emoji: string) =>
      request(`/tasks/${taskId}/comments/${commentId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    notifications: () => request('/notifications'),
    markNotificationRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    workspaceDocs: (workspaceId: string) => request(`/workspaces/${workspaceId}/docs`),
    uploadWorkspaceDoc: (
      workspaceId: string,
      payload: {
        title: string;
        category: 'sop' | 'policy' | 'guideline' | 'other';
        fileName?: string;
        fileType?: string;
        fileDataUrl?: string;
        notes?: string;
      }
    ) => request(`/workspaces/${workspaceId}/docs`, { method: 'POST', body: JSON.stringify(payload) }),
    deleteWorkspaceDoc: (workspaceId: string, docId: string) =>
      request(`/workspaces/${workspaceId}/docs/${docId}`, { method: 'DELETE' }),
    listSpaceTasks: (spaceId: string) => request(`/spaces/${spaceId}/tasks`),
    listSpaceDiscussion: (spaceId: string) => request(`/spaces/${spaceId}/discussion`),
    postSpaceDiscussion: (
      spaceId: string,
      payload: {
        content: string;
        attachments?: Array<{ filename: string; mimeType: string; dataUrl: string }>;
      }
    ) =>
      request(`/spaces/${spaceId}/discussion`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    deleteSpaceDiscussionMessage: (spaceId: string, messageId: string) =>
      request(`/spaces/${spaceId}/discussion/${messageId}`, { method: 'DELETE' }),
    listReminders: () => request('/reminders'),
    createReminder: (payload: {
      workspaceId: string;
      title: string;
      description?: string;
      /** ISO string for the moment the reminder fires. */
      dueDate: string;
      /** User ids that should get notified; creator is always included. */
      notifyUserIds?: string[];
      /** Optional file attachments (base64 data URLs). */
      attachments?: Array<{ filename: string; mimeType: string; dataUrl: string }>;
    }) => request('/reminders', { method: 'POST', body: JSON.stringify(payload) }),
    updateReminder: (
      id: string,
      payload: {
        title?: string;
        description?: string;
        dueDate?: string;
        status?: 'pending' | 'done' | 'cancelled';
        notifyUserIds?: string[];
      }
    ) => request(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteReminder: (id: string) => request(`/reminders/${id}`, { method: 'DELETE' }),
  },
};
