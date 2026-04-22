import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: null },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    department: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

const workspaceSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    logoUrl: { type: String, default: null },
    createdBy: { type: String, required: true, index: true },
    department: { type: String, required: true, index: true },
    /**
     * Admin-only overdue notification settings. When enabled, the server
     * periodically notifies task assignees + the creator that an incomplete
     * task has crossed its due date. Applies to every department/space in
     * the workspace.
     */
    overdueNotificationsEnabled: { type: Boolean, default: false },
    /** How often (minutes) to re-notify while the task stays overdue. */
    overdueNotificationIntervalMinutes: { type: Number, default: 30, min: 1 },
    /**
     * Office hours window (server local time, 24h clock). The overdue
     * scheduler only dispatches reminders when the current hour is within
     * [officeHoursStart, officeHoursEnd). Defaults to 10:00 – 19:00.
     */
    officeHoursStart: { type: Number, default: 10, min: 0, max: 23 },
    officeHoursEnd: { type: Number, default: 19, min: 1, max: 24 },
  },
  { timestamps: true }
);

const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    invitedBy: { type: String, default: null },
  },
  { timestamps: true }
);
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const userRoleSchema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ['admin', 'manager', 'team_lead', 'employee', 'guest', 'owner', 'member'],
      default: 'employee',
    },
  },
  { timestamps: true }
);
userRoleSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const spaceSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    department: { type: String, default: null, index: true },
    color: { type: String, default: '#7C3AED' },
    /** Optional single-character icon label (e.g. "W", "B"). Falls back to the
     *  first letter of the space name when empty. */
    icon: { type: String, default: null },
    isPrivate: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    /** Parent space id — department spaces live under the master "Team Space" folder. */
    parentSpaceId: { type: String, default: null, index: true },
    /** One per workspace: top folder that groups all department team spaces. */
    isMasterTeamSpace: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const folderSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    isPrivate: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

const listSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    folderId: { type: String, default: null },
    name: { type: String, required: true },
    createdBy: { type: String, required: true },
    /**
     * Cross-team delegation list directly under a department-main space.
     * Visible to every workspace member so they can assign tasks to that dept
     * without exposing the dept's private sub-folder lists.
     */
    isSharedMainList: { type: Boolean, default: false },
    /**
     * When true, only creator + users in `allowedUserIds` + admins can see
     * and operate on this list (department-level access is bypassed). All
     * existing lists default to `false`, so behavior is unchanged unless the
     * creator explicitly opts in via the "Restrict access" option.
     */
    isRestricted: { type: Boolean, default: false },
    /** Explicit allow-list of userIds that may access a restricted list. */
    allowedUserIds: { type: [String], default: [] },
    /**
     * Integer-ish sort position within a space. New lists get `Date.now()` by
     * default so existing ones (without this field) still render in creation
     * order. Explicit reordering overwrites with tight monotonic indices.
     */
    position: { type: Number, default: 0, index: true },
    /** When non-null, the list is "archived": hidden from sidebar + default navigation. */
    archivedAt: { type: Date, default: null, index: true },
    /** Optional custom color shown in the sidebar list icon. Hex string. */
    color: { type: String, default: null },
    /** Optional icon key (lucide-react name). Defaults to the built-in ListChecks glyph. */
    icon: { type: String, default: null },
    /** Short free-text description shown in the "List info" modal. */
    description: { type: String, default: null },
    /** Default task type for new tasks in this list (maps to task.type in the future). */
    defaultTaskType: {
      type: String,
      enum: ['task', 'milestone', 'form_response', 'meeting_note', 'process', 'project'],
      default: 'task',
    },
    /** Permutation of task status keys — board column order (admin). */
    kanbanColumnOrder: { type: [String], default: undefined },
    /** Custom header labels per status key (admin). */
    kanbanColumnLabels: { type: Schema.Types.Mixed, default: undefined },
    /** Extra Kanban columns (id + label); task status matches id. */
    kanbanCustomColumns: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, required: true },
          color: { type: String, default: '#A855F7' },
        },
      ],
      default: undefined,
    },
  },
  { timestamps: true }
);

const taskSchema = new Schema(
  {
    _id: { type: String, required: true },
    listId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, default: 'todo' },
    priority: { type: String, enum: ['urgent', 'high', 'normal', 'low'], default: 'normal' },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    createdBy: { type: String, required: true },
    /** Parent task id for subtasks (null for top-level tasks). */
    parentTaskId: { type: String, default: null, index: true },
    /** Lightweight inline checklist (e.g. "Review copy", "Publish"). */
    checklist: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          text: { type: String, required: true },
          done: { type: Boolean, default: false },
          /** Optional per-item assignees (shown as avatar chips in the UI). */
          assigneeIds: { type: [String], default: [] },
        },
      ],
      default: [],
    },
    /** Other task ids this task is linked to (bi-directional on read). */
    relatedTaskIds: { type: [String], default: [] },
    /**
     * Access level granted to any workspace member who isn't an explicit collaborator.
     * UI-facing only (the server still enforces workspace-level RBAC), but useful so
     * the client can gate destructive actions per task.
     */
    defaultPermission: {
      type: String,
      enum: ['full_edit', 'edit', 'comment', 'view'],
      default: 'full_edit',
    },
    /**
     * People the task has been explicitly shared with (in addition to assignees / owner).
     * Each entry carries a per-user role selected via the Share dialog.
     */
    collaborators: {
      type: [
        {
          _id: false,
          userId: { type: String, required: true },
          role: {
            type: String,
            enum: ['full_edit', 'edit', 'comment', 'view'],
            default: 'full_edit',
          },
          addedAt: { type: Date, default: () => new Date() },
        },
      ],
      default: [],
    },
    /** When true, only explicit collaborators + assignees + admins see the task in the UI. */
    isPrivate: { type: Boolean, default: false },
    /**
     * Last time the overdue scheduler sent an "overdue" / "due today" ping
     * for this task. Used to enforce the admin-configured interval between
     * re-notifications so assignees don't get spammed every poll.
     */
    lastOverdueNotifiedAt: { type: Date, default: null },
    /**
     * Marks when the one-time "due tomorrow" heads-up was dispatched. We only
     * send this reminder once per task; resetting to null (e.g. when the due
     * date is pushed out) re-enables the reminder.
     */
    dueSoonNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const userListFavoriteSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    listId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);
userListFavoriteSchema.index({ userId: 1, listId: 1 }, { unique: true });

const taskAssigneeSchema = new Schema(
  {
    taskId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);
taskAssigneeSchema.index({ taskId: 1, userId: 1 }, { unique: true });

const taskCommentSchema = new Schema(
  {
    _id: { type: String, required: true },
    taskId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    content: { type: String, default: '' },
    attachments: {
      type: [
        {
          filename: { type: String, required: true },
          mimeType: { type: String, required: true },
          dataUrl: { type: String, required: true },
        },
      ],
      default: [],
    },
    /** Users who opened the task and saw this comment (excludes author for own messages). */
    readBy: {
      type: [
        {
          userId: { type: String, required: true },
          readAt: { type: Date, default: () => new Date() },
        },
      ],
      default: [],
    },
    /**
     * Emoji reactions left on this comment. One (emoji, userId) pair per entry;
     * a user may react with multiple different emojis but each emoji is toggle-only
     * for them (second click removes it).
     */
    reactions: {
      type: [
        {
          _id: false,
          emoji: { type: String, required: true },
          userId: { type: String, required: true },
          createdAt: { type: Date, default: () => new Date() },
        },
      ],
      default: [],
    },
    /** When non-null, this comment is a threaded reply to the referenced comment. */
    parentCommentId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    taskId: { type: String, default: null },
    type: {
      type: String,
      enum: [
        'task_created',
        'task_status_changed',
        'reminder_pre_day',
        'reminder_due',
        'task_due_soon',
        'task_overdue',
      ],
      required: true,
    },
    reminderId: { type: String, default: null },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const workspaceInviteSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },
    role: { type: String, enum: ['admin', 'manager', 'team_lead', 'employee'], default: 'employee' },
    department: { type: String, default: null },
    invitedBy: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  },
  { timestamps: true }
);
workspaceInviteSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

const spaceDiscussionMessageSchema = new Schema(
  {
    _id: { type: String, required: true },
    spaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    content: { type: String, default: '' },
    attachments: {
      type: [
        {
          _id: false,
          filename: { type: String, required: true },
          mimeType: { type: String, required: true },
          dataUrl: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const reminderSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    /** User who created the reminder. */
    createdBy: { type: String, required: true, index: true },
    /** Target users who should receive notifications. Always includes createdBy unless filtered out explicitly. */
    notifyUserIds: {
      type: [String],
      default: [],
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    /** When the reminder fires. */
    dueDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'done', 'cancelled'],
      default: 'pending',
      index: true,
    },
    /** Timestamp when the one-day-before notification was dispatched. */
    preDayNotifiedAt: { type: Date, default: null },
    /** Timestamp when the due-day notification was dispatched. */
    dueDayNotifiedAt: { type: Date, default: null },
    /** Optional file attachments (stored as base64 data URLs, same shape as comment attachments). */
    attachments: {
      type: [
        {
          _id: false,
          filename: { type: String, default: '' },
          mimeType: { type: String, default: 'application/octet-stream' },
          dataUrl: { type: String, default: '' },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);
reminderSchema.index({ status: 1, dueDate: 1 });

const workspaceDocSchema = new Schema(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['sop', 'policy', 'guideline', 'other'],
      default: 'other',
    },
    fileName: { type: String, default: null },
    fileType: { type: String, default: null },
    fileDataUrl: { type: String, default: null },
    notes: { type: String, default: null },
    uploadedBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const User = model('User', userSchema);
export const Workspace = model('Workspace', workspaceSchema);
export const WorkspaceMember = model('WorkspaceMember', workspaceMemberSchema);
export const UserRole = model('UserRole', userRoleSchema);
export const Space = model('Space', spaceSchema);
export const Folder = model('Folder', folderSchema);
export const List = model('List', listSchema);
export const UserListFavorite = model('UserListFavorite', userListFavoriteSchema);
export const Task = model('Task', taskSchema);
export const TaskAssignee = model('TaskAssignee', taskAssigneeSchema);
export const TaskComment = model('TaskComment', taskCommentSchema);
export const Notification = model('Notification', notificationSchema);
export const WorkspaceInvite = model('WorkspaceInvite', workspaceInviteSchema);
export const WorkspaceDoc = model('WorkspaceDoc', workspaceDocSchema);
export const SpaceDiscussionMessage = model('SpaceDiscussionMessage', spaceDiscussionMessageSchema);
export const Reminder = model('Reminder', reminderSchema);
