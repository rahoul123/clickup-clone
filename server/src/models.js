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
    /** Permutation of task status keys — board column order (admin). */
    kanbanColumnOrder: { type: [String], default: undefined },
    /** Custom header labels per status key (admin). */
    kanbanColumnLabels: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

const taskSchema = new Schema(
  {
    _id: { type: String, required: true },
    listId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, enum: ['todo', 'in_progress', 'hold', 'revision', 'complete'], default: 'todo' },
    priority: { type: String, enum: ['urgent', 'high', 'normal', 'low'], default: 'normal' },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

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
  },
  { timestamps: true }
);

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    taskId: { type: String, default: null },
    type: { type: String, enum: ['task_created', 'task_status_changed'], required: true },
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
export const Task = model('Task', taskSchema);
export const TaskAssignee = model('TaskAssignee', taskAssigneeSchema);
export const TaskComment = model('TaskComment', taskCommentSchema);
export const Notification = model('Notification', notificationSchema);
export const WorkspaceInvite = model('WorkspaceInvite', workspaceInviteSchema);
export const WorkspaceDoc = model('WorkspaceDoc', workspaceDocSchema);
