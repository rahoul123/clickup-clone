import { Router } from 'express';
import { randomUUID } from 'crypto';
import { attachUser, loginUser, registerUser, requireAuth, toSafeUser } from './auth.js';
import { sendInviteEmail, sendTaskAssignedEmail, sendTaskCompletedEmail } from './mailer.js';
import {
  List,
  Notification,
  Reminder,
  Space,
  SpaceDiscussionMessage,
  Task,
  TaskAssignee,
  TaskComment,
  User,
  UserListFavorite,
  UserRole,
  WorkspaceDoc,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
} from './models.js';
import {
  canCreateList,
  canCreateSpace,
  canCreateTasks,
  canDeleteList,
  canDeleteSpace,
  canInviteMembers,
  canManageStructure,
  canManageWorkspace,
  canUpdateTask,
  canViewWorkspaceByDepartment,
  getRole,
} from './permissions.js';

function slugify(input) {
  return input.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function normalizeDepartment(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function isSameDepartment(a, b) {
  const left = normalizeDepartment(a);
  const right = normalizeDepartment(b);
  if (!left || !right) return false;
  return left === right;
}

function isDepartmentMatch(userDepartment, targetDepartment) {
  const userNorm = normalizeDepartment(userDepartment);
  const targetNorm = normalizeDepartment(targetDepartment);
  if (!userNorm || !targetNorm) return false;
  return userNorm === targetNorm || userNorm.includes(targetNorm) || targetNorm.includes(userNorm);
}

const TASK_STATUSES = ['todo', 'in_progress', 'hold', 'revision', 'complete'];
const DEFAULT_CUSTOM_COLUMN_COLOR = '#A855F7';

function normalizeHexColor(input) {
  const raw = String(input || '').trim();
  if (/^#([0-9a-fA-F]{6})$/.test(raw)) return raw.toUpperCase();
  return DEFAULT_CUSTOM_COLUMN_COLOR;
}

function normalizeKanbanColumnOrder(order, list) {
  const customCols = Array.isArray(list.kanbanCustomColumns) ? list.kanbanCustomColumns : [];
  const customIds = customCols.map((c) => c.id).filter(Boolean);
  const allowed = new Set([...TASK_STATUSES, ...customIds]);
  const defaultOrder = [...TASK_STATUSES, ...customIds];

  if (!order || !Array.isArray(order)) return defaultOrder;
  if (order.length < 1) return null;

  const seen = new Set();
  for (const k of order) {
    if (!allowed.has(k)) return null;
    if (seen.has(k)) return null;
    seen.add(k);
  }

  // Custom columns must stay visible unless explicitly deleted.
  for (const id of customIds) {
    if (!seen.has(id)) return null;
  }
  return order;
}

function resolveKanbanOrder(list) {
  const normalized = normalizeKanbanColumnOrder(list.kanbanColumnOrder, list);
  return normalized || [...TASK_STATUSES, ...(list.kanbanCustomColumns || []).map((c) => c.id)];
}

function isValidTaskStatusForList(list, status) {
  if (!status || typeof status !== 'string') return false;
  if (TASK_STATUSES.includes(status)) return true;
  return (list.kanbanCustomColumns || []).some((c) => c.id === status);
}

function serializeList(l, options = {}) {
  const labelsRaw = l.kanbanColumnLabels;
  const plainLabels =
    labelsRaw && typeof labelsRaw === 'object' && !Array.isArray(labelsRaw) ? { ...labelsRaw } : {};
  const createdAt = l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt);
  const customCols = Array.isArray(l.kanbanCustomColumns) ? l.kanbanCustomColumns : [];
  const kanban_custom_columns = customCols.map((c) => ({
    id: c.id,
    label: c.label,
    color: normalizeHexColor(c.color),
  }));
  const orderResolved = resolveKanbanOrder(l);
  // `options.favoriteIds` (Set<string>) lets the aggregated-navigation query
  // hydrate per-user favorite state in a single pass instead of one query
  // per list.
  const favoriteIds = options.favoriteIds instanceof Set ? options.favoriteIds : null;
  // `position` used to be absent from the schema — fall back to createdAt
  // millis so older rows render in stable creation order without a migration.
  const position =
    typeof l.position === 'number' && Number.isFinite(l.position) && l.position !== 0
      ? l.position
      : createdAt.getTime();
  const archivedAt = l.archivedAt ? new Date(l.archivedAt) : null;
  return {
    id: l._id,
    folder_id: l.folderId ?? null,
    space_id: l.spaceId,
    name: l.name,
    created_by: l.createdBy,
    created_at: createdAt.toISOString(),
    is_shared_main_list: Boolean(l.isSharedMainList),
    is_restricted: Boolean(l.isRestricted),
    allowed_user_ids: Array.isArray(l.allowedUserIds) ? [...l.allowedUserIds] : [],
    position,
    archived_at: archivedAt ? archivedAt.toISOString() : null,
    color: l.color ?? null,
    icon: l.icon ?? null,
    description: l.description ?? null,
    default_task_type: l.defaultTaskType ?? 'task',
    is_favorited: favoriteIds ? favoriteIds.has(l._id) : false,
    kanban_column_order: orderResolved,
    kanban_column_labels: plainLabels,
    kanban_custom_columns,
  };
}

/**
 * Batch-serialize a list of raw list docs with per-user favorite state.
 * Does a single `UserListFavorite.find` for the whole batch so we avoid
 * an N+1 round-trip.
 */
async function serializeListsForUser(lists, userId) {
  if (!Array.isArray(lists) || lists.length === 0) return [];
  const listIds = lists.map((l) => l._id);
  const favorites = await UserListFavorite.find({
    userId,
    listId: { $in: listIds },
  })
    .select({ listId: 1, _id: 0 })
    .lean();
  const favoriteIds = new Set(favorites.map((row) => row.listId));
  return lists.map((l) => serializeList(l, { favoriteIds }));
}

function serializeSpace(s) {
  const createdAt = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
  return {
    id: s._id,
    workspace_id: s.workspaceId,
    name: s.name,
    department: s.department ?? null,
    color: s.color,
    icon: s.icon ?? null,
    is_private: s.isPrivate,
    created_by: s.createdBy,
    created_at: createdAt.toISOString(),
    parent_space_id: s.parentSpaceId ?? null,
    is_master_team_space: !!s.isMasterTeamSpace,
  };
}

/** Ensures one master "Team Space" folder per workspace and reparents legacy root spaces under it. */
async function ensureMasterTeamSpace(workspaceId, userId) {
  let master = await Space.findOne({ workspaceId, isMasterTeamSpace: true }).lean();
  if (!master) {
    const doc = await Space.create({
      _id: randomUUID(),
      workspaceId,
      name: 'Team Space',
      department: null,
      color: '#7C3AED',
      isPrivate: false,
      isMasterTeamSpace: true,
      parentSpaceId: null,
      createdBy: userId,
    });
    master = doc.toObject();
  }
  await Space.updateMany(
    {
      workspaceId,
      _id: { $ne: master._id },
      $or: [{ parentSpaceId: null }, { parentSpaceId: { $exists: false } }],
      isMasterTeamSpace: { $ne: true },
    },
    { $set: { parentSpaceId: master._id } }
  );
  return master;
}

/** First-time default department + list under master (active workspace only). */
async function ensureDefaultDepartmentUnderMaster(workspace, master, userId) {
  const childCount = await Space.countDocuments({
    workspaceId: workspace._id,
    parentSpaceId: master._id,
    isMasterTeamSpace: { $ne: true },
  });
  if (childCount > 0) return;
  const general = await Space.create({
    _id: randomUUID(),
    workspaceId: workspace._id,
    parentSpaceId: master._id,
    name: 'General',
    department: workspace.department,
    color: '#8B5CF6',
    isPrivate: false,
    createdBy: userId,
  });
  await List.create({
    _id: randomUUID(),
    spaceId: general._id,
    name: 'Main Tasks',
    createdBy: userId,
  });
}

function canAccessSpaceByDepartment({
  role,
  userDepartment,
  workspaceDepartment,
  spaceDepartment,
  spaceName,
  isDepartmentMain = false,
}) {
  if (role === 'admin') return true;

  const userNorm = normalizeDepartment(userDepartment);
  if (!userNorm) return false;

  if (isDepartmentMain) {
    const mainSpaceDept = normalizeDepartment(spaceDepartment);
    if (mainSpaceDept) return isDepartmentMatch(userNorm, mainSpaceDept);
    const mainSpaceName = normalizeDepartment(spaceName);
    if (mainSpaceName) return mainSpaceName === userNorm || mainSpaceName.includes(userNorm) || userNorm.includes(mainSpaceName);
  }

  const explicitSpaceNorm = normalizeDepartment(spaceDepartment);
  if (explicitSpaceNorm) return isDepartmentMatch(userNorm, explicitSpaceNorm);

  const workspaceNorm = normalizeDepartment(workspaceDepartment);
  if (workspaceNorm) return isDepartmentMatch(userNorm, workspaceNorm);

  return false;
}

/** Ensure each department-main space has a single shared cross-team list. */
async function ensureSharedMainList(space, userId) {
  const existing = await List.findOne({ spaceId: space._id, isSharedMainList: true }).lean();
  if (existing) return existing;
  const list = await List.create({
    _id: randomUUID(),
    spaceId: space._id,
    name: 'Shared Tasks',
    isSharedMainList: true,
    createdBy: userId,
  });
  return list.toObject ? list.toObject() : list;
}

async function findTeamLeadForDepartment(workspaceId, department, excludeUserId = null) {
  const departmentNorm = normalizeDepartment(department);
  if (!departmentNorm) return null;

  const teamLeadRows = await UserRole.find({ workspaceId, role: 'team_lead' }).lean();
  if (!teamLeadRows.length) return null;

  const userIds = teamLeadRows.map((row) => row.userId);
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userById = Object.fromEntries(users.map((u) => [u._id, u]));

  for (const row of teamLeadRows) {
    if (excludeUserId && row.userId === excludeUserId) continue;
    const candidate = userById[row.userId];
    if (!candidate) continue;
    if (normalizeDepartment(candidate.department) === departmentNorm) {
      return candidate;
    }
  }
  return null;
}

/**
 * Check if a restricted list is accessible for a given user.
 * Admins + creator + explicit allow-list always pass. Any other check is
 * irrelevant once a list is marked restricted (department scope is bypassed).
 */
function canAccessRestrictedList(list, userId, role) {
  if (!list?.isRestricted) return true;
  if (normalizeRoleForRestriction(role) === 'admin') return true;
  if (userId && list.createdBy === userId) return true;
  const allowed = Array.isArray(list.allowedUserIds) ? list.allowedUserIds : [];
  return Boolean(userId && allowed.includes(userId));
}

function normalizeRoleForRestriction(role) {
  if (!role) return null;
  if (role === 'owner') return 'admin';
  if (role === 'member') return 'employee';
  return role;
}

/**
 * Check if a user can read/write tasks in a given list. Restricted lists are
 * gated first (creator / admin / explicit allow-list only). Shared cross-team
 * lists (`list.isSharedMainList`) are accessible to any workspace member,
 * otherwise fall back to strict department-scoped space access.
 */
function canAccessListForTasks({
  list,
  role,
  userId,
  userDepartment,
  workspaceDepartment,
  spaceDepartment,
  spaceName,
  isDepartmentMain,
}) {
  if (!canAccessRestrictedList(list, userId, role)) return false;
  if (list?.isSharedMainList) return true;
  return canAccessSpaceByDepartment({
    role,
    userDepartment,
    workspaceDepartment,
    spaceDepartment,
    spaceName,
    isDepartmentMain,
  });
}

async function isDepartmentMainSpace(space) {
  if (!space || space.isMasterTeamSpace || !space.parentSpaceId) return false;
  const parent = await Space.findById(space.parentSpaceId).lean();
  return Boolean(parent?.isMasterTeamSpace);
}

async function applyPendingInvitesForUser(user) {
  if (!user?.email) return;
  const email = String(user.email).toLowerCase().trim();
  const invites = await WorkspaceInvite.find({ email, status: 'pending' }).lean();
  if (!invites.length) return;

  for (const invite of invites) {
    await WorkspaceMember.updateOne(
      { workspaceId: invite.workspaceId, userId: user._id },
      { $set: { invitedBy: invite.invitedBy } },
      { upsert: true }
    );
    await UserRole.updateOne(
      { workspaceId: invite.workspaceId, userId: user._id },
      { $set: { role: invite.role } },
      { upsert: true }
    );
    if (invite.department && !user.department) {
      await User.updateOne({ _id: user._id }, { $set: { department: invite.department } });
      user.department = invite.department;
    }
    await WorkspaceInvite.updateOne({ _id: invite._id }, { $set: { status: 'accepted' } });
  }
}

/**
 * Shared mapper so task objects returned from list + detail + create + update endpoints
 * look identical to the client.
 */
function taskToDTO(task, assigneeIds) {
  return {
    id: task._id,
    list_id: task.listId,
    title: task.title,
    description: task.description ?? undefined,
    status: task.status,
    priority: task.priority,
    start_date: task.startDate ? task.startDate.toISOString() : undefined,
    due_date: task.dueDate ? task.dueDate.toISOString() : undefined,
    assignee_ids: assigneeIds,
    created_by: task.createdBy,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
    parent_task_id: task.parentTaskId ?? null,
    checklist: Array.isArray(task.checklist)
      ? task.checklist.map((item) => ({
          id: item.id,
          text: item.text,
          done: Boolean(item.done),
          assignee_ids: Array.isArray(item.assigneeIds) ? item.assigneeIds : [],
        }))
      : [],
    related_task_ids: Array.isArray(task.relatedTaskIds) ? task.relatedTaskIds : [],
    default_permission: task.defaultPermission ?? 'full_edit',
    collaborators: Array.isArray(task.collaborators)
      ? task.collaborators.map((c) => ({
          user_id: c.userId,
          role: c.role ?? 'full_edit',
          added_at:
            c.addedAt instanceof Date
              ? c.addedAt.toISOString()
              : c.addedAt
                ? new Date(c.addedAt).toISOString()
                : undefined,
        }))
      : [],
    is_private: Boolean(task.isPrivate),
  };
}

/**
 * Turn a TaskComment document into the DTO the client expects.
 * `userMap` is an id->displayName map so we can resolve author/reactor/reader names.
 */
function serializeComment(comment, userMap = {}) {
  const createdAt = comment.createdAt instanceof Date
    ? comment.createdAt
    : new Date(comment.createdAt);
  return {
    id: comment._id,
    task_id: comment.taskId,
    user_id: comment.userId,
    content: comment.content,
    attachments: comment.attachments || [],
    created_at: createdAt.toISOString(),
    author_name: userMap[comment.userId] ?? 'Unknown user',
    parent_comment_id: comment.parentCommentId ?? null,
    reactions: (comment.reactions || []).map((r) => ({
      emoji: r.emoji,
      user_id: r.userId,
      user_name: userMap[r.userId] ?? 'Unknown user',
    })),
    read_by: (comment.readBy || [])
      .filter((r) => r.userId !== comment.userId)
      .map((r) => ({
        user_id: r.userId,
        read_at: r.readAt ? new Date(r.readAt).toISOString() : undefined,
        name: userMap[r.userId] ?? 'Unknown user',
      })),
    is_activity: Boolean(comment.isActivity),
  };
}

async function createTaskActivityEntry({ taskId, userId, content }) {
  if (!taskId || !userId || !content) return;
  const since = new Date(Date.now() - 2000);
  const existing = await TaskComment.findOne({
    taskId,
    userId,
    content,
    isActivity: true,
    createdAt: { $gte: since },
  }).lean();
  if (existing) return;
  await TaskComment.create({
    _id: randomUUID(),
    taskId,
    userId,
    content,
    attachments: [],
    parentCommentId: null,
    isActivity: true,
  }).catch(() => {});
}

const TASK_STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  hold: 'Hold',
  revision: 'Revision',
  complete: 'Complete',
};

const TASK_PRIORITY_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

function labelTaskStatus(value) {
  if (!value) return 'None';
  return TASK_STATUS_LABELS[value] ?? value;
}

function labelTaskPriority(value) {
  if (!value) return 'None';
  return TASK_PRIORITY_LABELS[value] ?? value;
}

function labelTaskDueDate(value) {
  if (!value) return 'None';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'None';
  return date.toLocaleDateString('en-GB');
}

async function hydrateTasks(listId) {
  const [tasks, assignees] = await Promise.all([
    Task.find({ listId }).sort({ createdAt: -1 }).lean(),
    TaskAssignee.find({}).lean(),
  ]);
  const byTask = assignees.reduce((acc, row) => {
    if (!acc[row.taskId]) acc[row.taskId] = [];
    acc[row.taskId].push(row.userId);
    return acc;
  }, {});
  return tasks.map((t) => taskToDTO(t, byTask[t._id] ?? []));
}

/** Tasks across many lists; assignees loaded only for returned tasks (efficient). */
async function hydrateTasksForListIds(listIds) {
  if (!listIds.length) return [];
  const tasks = await Task.find({ listId: { $in: listIds } }).sort({ updatedAt: -1 }).lean();
  const taskIds = tasks.map((t) => t._id);
  const assignees = taskIds.length ? await TaskAssignee.find({ taskId: { $in: taskIds } }).lean() : [];
  const byTask = assignees.reduce((acc, row) => {
    if (!acc[row.taskId]) acc[row.taskId] = [];
    acc[row.taskId].push(row.userId);
    return acc;
  }, {});
  return tasks.map((t) => taskToDTO(t, byTask[t._id] ?? []));
}

/**
 * All workspaces the user may see + aggregated spaces/lists with the same rules as bootstrap,
 * but across every visible workspace (department + space rules per workspace role).
 */
async function loadAggregatedNavigation(userId) {
  const currentUser = await User.findById(userId).lean();
  const memberRows = await WorkspaceMember.find({ userId }).lean();
  let workspaceIds = memberRows.map((m) => m.workspaceId);

  if (workspaceIds.length === 0) {
    const id = randomUUID();
    const owner = await User.findById(userId).lean();
    const department = owner?.department || 'general';
    await Workspace.create({
      _id: id,
      name: 'Team Workspace',
      slug: `team-workspace-${Date.now()}`,
      createdBy: userId,
      department,
    });
    await WorkspaceMember.create({ workspaceId: id, userId });
    await UserRole.create({ workspaceId: id, userId, role: 'admin' });
    workspaceIds = [id];
  }

  const allWorkspaces = await Workspace.find({ _id: { $in: workspaceIds } }).sort({ createdAt: 1 }).lean();
  const visibleWorkspaces = [];
  for (const workspace of allWorkspaces) {
    const roleForWorkspace = await getRole(workspace._id, userId);
    if (canViewWorkspaceByDepartment(currentUser?.department ?? null, workspace.department, roleForWorkspace)) {
      visibleWorkspaces.push(workspace);
    }
  }
  if (!visibleWorkspaces.length) {
    return { error: { status: 403, message: 'No department workspace access available.' } };
  }

  const activeWorkspace = visibleWorkspaces[0];
  const aggregatedSpaces = [];
  const aggregatedLists = [];
  /** @type {Record<string, { workspace_id: string; workspace_name: string; space_id: string; space_name: string; list_name: string }>} */
  const listContextById = {};

  for (const workspace of visibleWorkspaces) {
    const roleForWs = (await getRole(workspace._id, userId)) ?? 'employee';
    await ensureMasterTeamSpace(workspace._id, userId);
    let spaceRows = await Space.find({ workspaceId: workspace._id }).sort({ createdAt: 1 }).lean();
    const masterSpace = spaceRows.find((s) => s.isMasterTeamSpace);
    if (workspace._id === activeWorkspace._id) {
      const master = masterSpace;
      if (master) {
        await ensureDefaultDepartmentUnderMaster(workspace, master, userId);
        spaceRows = await Space.find({ workspaceId: workspace._id }).sort({ createdAt: 1 }).lean();
      }
    }

    const isDepartmentMainFor = (space) =>
      Boolean(masterSpace && space.parentSpaceId === masterSpace._id);
    const hasFullSpaceAccess = (space) =>
      space.isMasterTeamSpace ||
      canAccessSpaceByDepartment({
        role: roleForWs,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace.department,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain: isDepartmentMainFor(space),
      });
    // Sidebar visibility: master + all department-main folders + own-dept sub-spaces.
    const visibleSpaceRows = spaceRows.filter(
      (space) => space.isMasterTeamSpace || isDepartmentMainFor(space) || hasFullSpaceAccess(space)
    );
    if (!visibleSpaceRows.length) continue;

    const ownAccessSpaces = visibleSpaceRows.filter((s) => hasFullSpaceAccess(s));
    const ownAccessSpaceIds = new Set(ownAccessSpaces.map((s) => s._id));
    const crossDeptMainSpaces = visibleSpaceRows.filter(
      (s) => isDepartmentMainFor(s) && !ownAccessSpaceIds.has(s._id)
    );

    // Ensure every cross-dept main space has exactly one shared list so
    // the clicker always has a board to land on.
    for (const space of crossDeptMainSpaces) {
      await ensureSharedMainList(space, userId);
    }

    // Restricted lists remain visible in the sidebar (name + lock icon) so the
    // viewer knows they exist and can request access. Actual task read/write
    // is still blocked via `canAccessListForTasks`. Archived lists are filtered
    // out — they can still be restored from the "Archived lists" panel.
    const activeListFilter = { archivedAt: null };
    let ownLists = await List.find({
      spaceId: { $in: [...ownAccessSpaceIds] },
      ...activeListFilter,
    })
      .sort({ position: 1, createdAt: 1 })
      .lean();
    const crossLists = crossDeptMainSpaces.length
      ? await List.find({
          spaceId: { $in: crossDeptMainSpaces.map((s) => s._id) },
          isSharedMainList: true,
          ...activeListFilter,
        })
          .sort({ position: 1, createdAt: 1 })
          .lean()
      : [];

    // Auto-create a default list if user's own department has no lists at all.
    if (!ownLists.length && ownAccessSpaces.length) {
      const preferred =
        ownAccessSpaces.find((s) => !s.isMasterTeamSpace && isDepartmentMainFor(s)) ||
        ownAccessSpaces.find((s) => !s.isMasterTeamSpace) ||
        ownAccessSpaces[0];
      if (preferred) {
        const defaultList = await List.create({
          _id: randomUUID(),
          spaceId: preferred._id,
          name: 'Main Tasks',
          createdBy: userId,
        });
        ownLists = [defaultList.toObject ? defaultList.toObject() : defaultList];
      }
    }

    const listRows = [...ownLists, ...crossLists];

    aggregatedSpaces.push(...visibleSpaceRows);
    aggregatedLists.push(...listRows);

    const spaceById = Object.fromEntries(visibleSpaceRows.map((s) => [s._id, s]));
    for (const list of listRows) {
      const sp = spaceById[list.spaceId];
      if (!sp) continue;
      listContextById[list._id] = {
        workspace_id: workspace._id,
        workspace_name: workspace.name,
        space_id: sp._id,
        space_name: sp.name,
        list_name: list.name,
      };
    }
  }

  if (!aggregatedSpaces.length) {
    return { error: { status: 403, message: 'No team space access for your department.' } };
  }

  const listsInActiveWs = aggregatedLists
    .filter((l) => {
      const sp = aggregatedSpaces.find((s) => s._id === l.spaceId);
      return sp && sp.workspaceId === activeWorkspace._id;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const activeListId = listsInActiveWs[0]?._id ?? aggregatedLists[0]?._id ?? null;

  return {
    currentUser,
    activeWorkspace,
    visibleWorkspaces,
    aggregatedSpaces,
    aggregatedLists,
    listContextById,
    activeListId,
  };
}

async function createNotifications({ userIds, workspaceId, taskId, type, message, realtime }) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  const docs = uniqueUserIds.map((userId) => ({
    _id: randomUUID(),
    userId,
    workspaceId,
    taskId,
    type,
    message,
    read: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await Notification.insertMany(docs, { ordered: false }).catch(() => {});

  // Push each recipient their fresh bell notification so unread counts +
  // toasts appear in real time instead of only on the next poll. The shape
  // mirrors the GET /notifications REST DTO so client handlers can reuse
  // the existing `Notification` type without branching.
  if (realtime?.toUser) {
    for (const doc of docs) {
      realtime.toUser(doc.userId, 'notification:new', {
        id: doc._id,
        taskId: doc.taskId ?? null,
        workspaceId: doc.workspaceId,
        type: doc.type,
        message: doc.message,
        read: false,
        createdAt: doc.createdAt.toISOString(),
      });
    }
  }
}

export function buildRoutes({ realtime } = {}) {
  const router = Router();
  router.use(attachUser);

  // ────────────────────────────────────────────────────────────────────
  // Realtime broadcast helpers. Guarded so routes don't crash if the
  // realtime layer isn't wired up (e.g. tests that don't need websockets).
  // ────────────────────────────────────────────────────────────────────
  const rt = {
    broadcast: (event, payload) => realtime?.broadcast?.(event, payload),
    toUser: (userId, event, payload) => realtime?.toUser?.(userId, event, payload),
    toUsers: (userIds, event, payload) => realtime?.toUsers?.(userIds, event, payload),
  };

  router.get('/health', (_req, res) => res.json({ ok: true }));

  router.get('/public/departments', async (_req, res) => {
    // Source of truth: department-main folders that appear under a master
    // team space in the sidebar. Use each folder's display name (deduped
    // case-insensitively, preferring the first casing seen) so users see
    // exactly the same list that admins set up.
    const masters = await Space.find({ isMasterTeamSpace: true }).lean();
    const masterIds = masters.map((m) => m._id);
    const deptSpaces = masterIds.length
      ? await Space.find({
          parentSpaceId: { $in: masterIds },
          isMasterTeamSpace: { $ne: true },
        })
          .sort({ createdAt: 1 })
          .lean()
      : [];

    const seen = new Map();
    for (const space of deptSpaces) {
      const label = String(space.name || space.department || '').trim();
      if (!label) continue;
      if (label.toLowerCase() === 'general') continue;
      const key = label.toLowerCase().replace(/\s+/g, '');
      if (!seen.has(key)) seen.set(key, label);
    }
    const departments = [...seen.values()].sort((a, b) => a.localeCompare(b));
    res.json({ departments });
  });

  router.post('/auth/signup', async (req, res) => {
    try {
      const { email, password, displayName, department } = req.body ?? {};
      if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
      let user = await registerUser({ email, password, displayName });
      if (department?.trim()) {
        await User.updateOne({ _id: user._id }, { $set: { department: department.trim() } });
        user.department = department.trim();
      }
      await applyPendingInvitesForUser(user);
      user = await User.findById(user._id).lean();
      req.session.userId = user._id;
      res.json({ user: toSafeUser(user) });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Signup failed' });
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      let user = await loginUser({ email, password });
      await applyPendingInvitesForUser(user);
      user = await User.findById(user._id).lean();
      req.session.userId = user._id;
      res.json({ user: toSafeUser(user) });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Login failed' });
    }
  });

  router.post('/auth/logout', requireAuth, async (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('collab.sid');
      res.json({ ok: true });
    });
  });

  router.get('/auth/me', (req, res) => {
    if (!req.currentUser) return res.status(401).json({ user: null });
    res.json({ user: toSafeUser(req.currentUser) });
  });

  router.get('/notifications', requireAuth, async (req, res) => {
    const notifications = await Notification.find({ userId: req.session.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({
      notifications: notifications.map((n) => ({
        id: n._id,
        taskId: n.taskId,
        workspaceId: n.workspaceId,
        type: n.type,
        message: n.message,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount: notifications.filter((n) => !n.read).length,
    });
  });

  router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
    await Notification.updateOne({ _id: req.params.id, userId: req.session.userId }, { $set: { read: true } });
    res.json({ ok: true });
  });

  router.get('/workspaces/:workspaceId/docs', requireAuth, async (req, res) => {
    const { workspaceId } = req.params;
    const role = await getRole(workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });

    const docs = await WorkspaceDoc.find({ workspaceId }).sort({ createdAt: -1 }).lean();
    res.json({
      docs: docs.map((doc) => ({
        id: doc._id,
        workspace_id: doc.workspaceId,
        title: doc.title,
        category: doc.category,
        file_name: doc.fileName,
        file_type: doc.fileType,
        file_data_url: doc.fileDataUrl,
        notes: doc.notes,
        uploaded_by: doc.uploadedBy,
        created_at: doc.createdAt.toISOString(),
      })),
    });
  });

  router.post('/workspaces/:workspaceId/docs', requireAuth, async (req, res) => {
    const { workspaceId } = req.params;
    const role = await getRole(workspaceId, req.session.userId);
    if (!canManageWorkspace(role)) return res.status(403).json({ message: 'Only admin can upload docs' });

    const { title, category, fileName, fileType, fileDataUrl, notes } = req.body ?? {};
    const safeTitle = String(title || '').trim();
    if (!safeTitle) return res.status(400).json({ message: 'Title is required' });

    const allowedCategories = new Set(['sop', 'policy', 'guideline', 'other']);
    const safeCategory = allowedCategories.has(String(category)) ? String(category) : 'other';
    const safeNotes = typeof notes === 'string' ? notes.trim().slice(0, 1000) : '';
    const safeFileDataUrl = typeof fileDataUrl === 'string' ? fileDataUrl : '';
    if (safeFileDataUrl && safeFileDataUrl.length > 2_500_000) {
      return res.status(400).json({ message: 'File is too large. Keep it under 2 MB.' });
    }

    const doc = await WorkspaceDoc.create({
      _id: randomUUID(),
      workspaceId,
      title: safeTitle,
      category: safeCategory,
      fileName: typeof fileName === 'string' ? fileName.trim().slice(0, 200) : null,
      fileType: typeof fileType === 'string' ? fileType.trim().slice(0, 200) : null,
      fileDataUrl: safeFileDataUrl || null,
      notes: safeNotes || null,
      uploadedBy: req.session.userId,
    });

    res.json({
      doc: {
        id: doc._id,
        workspace_id: doc.workspaceId,
        title: doc.title,
        category: doc.category,
        file_name: doc.fileName,
        file_type: doc.fileType,
        file_data_url: doc.fileDataUrl,
        notes: doc.notes,
        uploaded_by: doc.uploadedBy,
        created_at: doc.createdAt.toISOString(),
      },
    });
  });

  router.delete('/workspaces/:workspaceId/docs/:docId', requireAuth, async (req, res) => {
    const { workspaceId, docId } = req.params;
    const role = await getRole(workspaceId, req.session.userId);
    if (!canManageWorkspace(role)) return res.status(403).json({ message: 'Only admin can delete docs' });

    const doc = await WorkspaceDoc.findOne({ _id: docId, workspaceId }).lean();
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    await WorkspaceDoc.deleteOne({ _id: docId, workspaceId });
    res.json({ ok: true });
  });

  router.post('/auth/forgot-password', (_req, res) => {
    res.json({ ok: true, message: 'Password reset email flow disabled in local migration.' });
  });

  router.post('/auth/reset-password', requireAuth, async (req, res) => {
    const { password } = req.body ?? {};
    if (!password || password.length < 6) return res.status(400).json({ message: 'Invalid password' });
    req.currentUser.passwordHash = await (await import('bcryptjs')).default.hash(password, 10);
    await User.updateOne({ _id: req.currentUser._id }, { $set: { passwordHash: req.currentUser.passwordHash } });
    res.json({ ok: true });
  });

  router.get('/app/bootstrap', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const nav = await loadAggregatedNavigation(userId);
    if (nav.error) {
      return res.status(nav.error.status).json({ message: nav.error.message });
    }

    const {
      activeWorkspace,
      visibleWorkspaces: workspaces,
      aggregatedSpaces: spaces,
      aggregatedLists: lists,
      activeListId,
    } = nav;

    const role = (await getRole(activeWorkspace._id, userId)) ?? 'employee';
    const tasks = await hydrateTasks(activeListId);

    const workspaceMemberRows = await WorkspaceMember.find({ workspaceId: activeWorkspace._id }).lean();
    const workspaceRoleRows = await UserRole.find({ workspaceId: activeWorkspace._id }).lean();
    const roleByUserId = Object.fromEntries(workspaceRoleRows.map((row) => [row.userId, row.role]));
    const users = await User.find({ _id: { $in: workspaceMemberRows.map((m) => m.userId) } }).lean();

    // Team Members page (role/department governance) — respects dept scoping.
    const teamMembersVisibleUsers = users.filter((u) => {
      if (role === 'admin') return true;
      const memberRole = roleByUserId[u._id] ?? 'employee';
      if (role === 'manager') {
        if (!isSameDepartment(u.department, req.currentUser?.department)) return u._id === userId;
        return memberRole === 'manager' || memberRole === 'team_lead' || memberRole === 'employee';
      }
      if (role === 'team_lead') {
        if (!isSameDepartment(u.department, req.currentUser?.department)) return u._id === userId;
        return memberRole === 'team_lead' || memberRole === 'employee';
      }
      return u._id === userId || memberRole === 'employee';
    });

    // Task assignee picker — every workspace member is assignable regardless
    // of role, with the viewer's own department members listed first.
    const selfDeptNorm = normalizeDepartment(req.currentUser?.department ?? null);
    const isOwnDept = (u) => {
      if (!selfDeptNorm) return false;
      const memberDept = normalizeDepartment(u.department);
      return Boolean(memberDept && isDepartmentMatch(selfDeptNorm, memberDept));
    };
    const assigneeCandidates = [...users].sort((a, b) => {
      const aOwn = isOwnDept(a) ? 0 : 1;
      const bOwn = isOwnDept(b) ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      const aLabel = String(a.displayName || a.email || '').toLowerCase();
      const bLabel = String(b.displayName || b.email || '').toLowerCase();
      return aLabel.localeCompare(bLabel);
    });

    const displayNameCount = users.reduce((acc, u) => {
      const key = String(u.displayName || '').trim().toLowerCase();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const formatMemberLabel = (u) => {
      const baseLabel = u.displayName || u.email || 'Unknown user';
      const nameKey = String(u.displayName || '').trim().toLowerCase();
      if (!nameKey || (displayNameCount[nameKey] || 0) < 2) return baseLabel;
      return `${baseLabel} (${u.email})`;
    };
    const memberOptions = assigneeCandidates.map((u) => ({
      id: u._id,
      label: formatMemberLabel(u),
    }));
    const teamMembers = teamMembersVisibleUsers.map((u) => ({
      id: u._id,
      label: formatMemberLabel(u),
      role: roleByUserId[u._id] ?? 'employee',
    }));

    const rolesByWorkspaceId = {};
    for (const w of workspaces) {
      rolesByWorkspaceId[w._id] = (await getRole(w._id, userId)) ?? 'employee';
    }

    res.json({
      workspaces: workspaces.map((w) => ({
        id: w._id,
        name: w.name,
        slug: w.slug,
        logo_url: w.logoUrl,
        department: w.department,
        created_by: w.createdBy,
        created_at: w.createdAt.toISOString(),
      })),
      spaces: spaces.map((s) => serializeSpace(s)),
      lists: await serializeListsForUser(lists, userId),
      tasks,
      memberOptions,
      teamMembers,
      activeWorkspaceId: activeWorkspace._id,
      activeListId,
      activeRole: role,
      rolesByWorkspaceId,
    });
  });

  router.get('/app/home-tasks', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const nav = await loadAggregatedNavigation(userId);
    if (nav.error) {
      return res.status(nav.error.status).json({ message: nav.error.message });
    }
    const { aggregatedLists, listContextById } = nav;
    const listIds = aggregatedLists.map((l) => l._id);
    const rawTasks = await hydrateTasksForListIds(listIds);
    const taskIds = rawTasks.map((t) => t.id);

    const commentGroups =
      taskIds.length > 0
        ? await TaskComment.aggregate([
            { $match: { taskId: { $in: taskIds } } },
            { $group: { _id: '$taskId', count: { $sum: 1 } } },
          ])
        : [];
    const commentCountByTask = Object.fromEntries(commentGroups.map((g) => [g._id, g.count]));

    const userIdSet = new Set();
    for (const t of rawTasks) {
      userIdSet.add(t.created_by);
      (t.assignee_ids || []).forEach((id) => userIdSet.add(id));
    }
    const userRows = userIdSet.size ? await User.find({ _id: { $in: [...userIdSet] } }).lean() : [];
    const labelById = Object.fromEntries(userRows.map((u) => [u._id, u.displayName || u.email || 'Unknown']));

    const tasks = rawTasks.map((t) => {
      const ctx = listContextById[t.list_id];
      const creator_label = labelById[t.created_by] ?? 'Unknown';
      const assignee_labels = (t.assignee_ids || []).map((id) => labelById[id] ?? id);
      return {
        ...t,
        workspace_id: ctx?.workspace_id,
        workspace_name: ctx?.workspace_name,
        space_name: ctx?.space_name,
        list_name: ctx?.list_name,
        creator_label,
        assignee_labels,
        comment_count: commentCountByTask[t.id] ?? 0,
      };
    });

    res.json({ tasks });
  });

  router.get('/app/dashboard-analytics', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const nav = await loadAggregatedNavigation(userId);
    if (nav.error) {
      return res.status(nav.error.status).json({ message: nav.error.message });
    }

    const { aggregatedLists, listContextById, visibleWorkspaces } = nav;
    const listIds = aggregatedLists.map((l) => l._id);
    const rawTasks = await hydrateTasksForListIds(listIds);
    const requestedWorkspaceId = String(req.query?.workspaceId || '').trim();

    const roleRank = { guest: 0, employee: 1, team_lead: 2, manager: 3, admin: 4 };
    let viewerRole = null;
    if (requestedWorkspaceId && visibleWorkspaces.some((w) => w._id === requestedWorkspaceId)) {
      viewerRole = await getRole(requestedWorkspaceId, userId);
    }
    if (!viewerRole) {
      for (const workspace of visibleWorkspaces) {
        const role = (await getRole(workspace._id, userId)) ?? 'employee';
        if (!viewerRole || roleRank[role] > roleRank[viewerRole]) viewerRole = role;
      }
    }
    viewerRole = viewerRole ?? 'employee';

    const scopedTasks =
      viewerRole === 'employee'
        ? rawTasks.filter((task) => task.created_by === userId || (task.assignee_ids || []).includes(userId))
        : rawTasks;

    const now = new Date();
    const thisYear = now.getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const statusBreakdown = { todo: 0, in_progress: 0, hold: 0, revision: 0, complete: 0 };
    const priorityBreakdown = { urgent: 0, high: 0, normal: 0, low: 0 };
    const monthlyMap = {};
    const memberStats = {};

    for (let i = 0; i < 12; i += 1) {
      monthlyMap[i] = {
        monthIndex: i,
        month: monthNames[i],
        total: 0,
        completed: 0,
        todo: 0,
        in_progress: 0,
        hold: 0,
        revision: 0,
      };
    }

    let completed = 0;
    let overdueOpen = 0;
    let dueSoon = 0;

    const spaceMonthlyMap = {};

    for (const task of scopedTasks) {
      const status = task.status || 'todo';
      const priority = task.priority || 'normal';
      const updatedAt = task.updated_at ? new Date(task.updated_at) : null;
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      const createdBy = task.created_by;

      if (statusBreakdown[status] !== undefined) statusBreakdown[status] += 1;
      if (priorityBreakdown[priority] !== undefined) priorityBreakdown[priority] += 1;
      if (status === 'complete') completed += 1;
      if (dueDate && dueDate < now && status !== 'complete') overdueOpen += 1;
      if (dueDate && dueDate >= now) {
        const diffMs = dueDate.getTime() - now.getTime();
        const dayDiff = diffMs / (1000 * 60 * 60 * 24);
        if (dayDiff <= 7 && status !== 'complete') dueSoon += 1;
      }

      if (updatedAt && updatedAt.getFullYear() === thisYear) {
        const m = updatedAt.getMonth();
        monthlyMap[m].total += 1;
        if (status === 'complete') monthlyMap[m].completed += 1;
        if (monthlyMap[m][status] !== undefined) monthlyMap[m][status] += 1;

        if (viewerRole === 'admin') {
          const ctx = listContextById[task.list_id];
          const spaceKey = ctx?.space_id ? `${ctx.workspace_id}:${ctx.space_id}` : 'unknown:unknown';
          if (!spaceMonthlyMap[spaceKey]) {
            const months = [];
            for (let i = 0; i < 12; i += 1) {
              months.push({
                monthIndex: i,
                month: monthNames[i],
                total: 0,
                completed: 0,
              });
            }
            spaceMonthlyMap[spaceKey] = {
              workspace_id: ctx?.workspace_id ?? null,
              workspace_name: ctx?.workspace_name ?? 'Unknown Workspace',
              space_id: ctx?.space_id ?? null,
              space_name: ctx?.space_name ?? 'Unknown Space',
              monthly: months,
            };
          }
          spaceMonthlyMap[spaceKey].monthly[m].total += 1;
          if (status === 'complete') spaceMonthlyMap[spaceKey].monthly[m].completed += 1;
        }
      }

      const participants = new Set([createdBy, ...(task.assignee_ids || [])]);
      for (const participantId of participants) {
        if (!participantId) continue;
        if (!memberStats[participantId]) {
          memberStats[participantId] = {
            userId: participantId,
            total: 0,
            completed: 0,
          };
        }
        memberStats[participantId].total += 1;
        if (status === 'complete') memberStats[participantId].completed += 1;
      }
    }

    const memberIds = Object.keys(memberStats);
    const memberRows = memberIds.length ? await User.find({ _id: { $in: memberIds } }).lean() : [];
    const memberLabelById = Object.fromEntries(memberRows.map((m) => [m._id, m.displayName || m.email || 'Unknown']));

    let teamPerformance = Object.values(memberStats)
      .map((row) => ({
        user_id: row.userId,
        user_name: memberLabelById[row.userId] ?? row.userId,
        total: row.total,
        completed: row.completed,
        completion_rate: row.total ? Math.round((row.completed / row.total) * 100) : 0,
      }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 8);

    const currentUserPerformance = memberStats[userId]
      ? {
          user_id: userId,
          user_name: memberLabelById[userId] ?? 'You',
          total: memberStats[userId].total,
          completed: memberStats[userId].completed,
          completion_rate: memberStats[userId].total
            ? Math.round((memberStats[userId].completed / memberStats[userId].total) * 100)
            : 0,
        }
      : {
          user_id: userId,
          user_name: memberLabelById[userId] ?? 'You',
          total: 0,
          completed: 0,
          completion_rate: 0,
        };

    if (viewerRole === 'employee') {
      teamPerformance = [currentUserPerformance];
    }

    const totalTasks = scopedTasks.length;
    const completionRate = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;
    const scope = viewerRole === 'admin' ? 'organization' : viewerRole === 'employee' ? 'self' : 'team';

    res.json({
      scope,
      viewerRole,
      summary: {
        total_tasks: totalTasks,
        completed_tasks: completed,
        completion_rate: completionRate,
        in_progress_tasks: statusBreakdown.in_progress,
        overdue_open_tasks: overdueOpen,
        due_soon_tasks: dueSoon,
      },
      monthly: Object.values(monthlyMap),
      statusBreakdown,
      priorityBreakdown,
      currentUserPerformance,
      teamPerformance,
      spaceMonthly: viewerRole === 'admin' ? Object.values(spaceMonthlyMap) : [],
    });
  });

  /**
   * Lightweight task title search scoped to a workspace — powers the "Relate items" picker.
   * Returns the first matches across all lists/spaces the caller has role-based access to.
   */
  router.get('/workspaces/:workspaceId/tasks-search', requireAuth, async (req, res) => {
    const { workspaceId } = req.params;
    const q = String(req.query.q || '').trim();
    const excludeId = String(req.query.exclude || '').trim();
    if (!q) return res.json({ tasks: [] });

    const role = await getRole(workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });

    const spaces = await Space.find({ workspaceId }, { _id: 1, name: 1 }).lean();
    const spaceIds = spaces.map((s) => s._id);
    if (spaceIds.length === 0) return res.json({ tasks: [] });

    const lists = await List.find({ spaceId: { $in: spaceIds } }, { _id: 1, name: 1, spaceId: 1 }).lean();
    const listIds = lists.map((l) => l._id);
    const listMap = new Map(lists.map((l) => [l._id, l]));
    const spaceMap = new Map(spaces.map((s) => [s._id, s]));

    // Escape user input for regex, then do a case-insensitive contains search.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tasks = await Task.find({
      listId: { $in: listIds },
      _id: { $ne: excludeId || undefined },
      title: { $regex: escaped, $options: 'i' },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    res.json({
      tasks: tasks.map((t) => {
        const list = listMap.get(t.listId);
        const space = list ? spaceMap.get(list.spaceId) : null;
        return {
          id: t._id,
          title: t.title,
          status: t.status,
          list_id: t.listId,
          list_name: list?.name ?? null,
          space_name: space?.name ?? null,
        };
      }),
    });
  });

  router.get('/lists/:listId/tasks', requireAuth, async (req, res) => {
    const list = await List.findById(req.params.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });
    const currentUser = await User.findById(req.session.userId).lean();
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);
    if (!canViewWorkspaceByDepartment(currentUser?.department ?? null, workspace?.department ?? null, role)) {
      return res.status(403).json({ message: 'Department access blocked' });
    }
    if (
      !canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    ) {
      return res.status(403).json({ message: 'Space department access blocked' });
    }
    res.json({ tasks: await hydrateTasks(req.params.listId) });
  });

  router.post('/workspaces', requireAuth, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const department = String(req.body?.department || '').trim();
    if (!name) return res.status(400).json({ message: 'Name required' });
    if (!department) return res.status(400).json({ message: 'Department required' });
    const workspace = await Workspace.create({
      _id: randomUUID(),
      name,
      slug: `${slugify(name)}-${Date.now()}`,
      createdBy: req.session.userId,
      department,
    });
    await User.updateOne({ _id: req.session.userId }, { $set: { department } });
    await WorkspaceMember.create({ workspaceId: workspace._id, userId: req.session.userId });
    await UserRole.create({ workspaceId: workspace._id, userId: req.session.userId, role: 'admin' });
    res.json({
      workspace: {
        id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
        logo_url: workspace.logoUrl,
        department: workspace.department,
        created_by: workspace.createdBy,
        created_at: workspace.createdAt.toISOString(),
      },
    });
  });

  router.post('/spaces', requireAuth, async (req, res) => {
    const { workspaceId, name, department } = req.body ?? {};
    const role = await getRole(workspaceId, req.session.userId);
    if (!canCreateSpace(role)) return res.status(403).json({ message: 'Only admin can create spaces' });
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    const master = await ensureMasterTeamSpace(workspaceId, req.session.userId);
    const space = await Space.create({
      _id: randomUUID(),
      workspaceId,
      parentSpaceId: master._id,
      name,
      department: String(department || workspace.department || '').trim() || null,
      createdBy: req.session.userId,
    });
    res.json({
      space: serializeSpace(space.toObject()),
    });
  });

  router.post('/lists', requireAuth, async (req, res) => {
    const { spaceId, name, isRestricted, allowedUserIds } = req.body ?? {};
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canCreateList(role)) return res.status(403).json({ message: 'Only admin/manager/team lead can create folders/lists' });

    // Non-admins can only create lists inside their OWN department's spaces.
    if (role !== 'admin') {
      const currentUser = await User.findById(req.session.userId).lean();
      const workspace = await Workspace.findById(space.workspaceId).lean();
      const userNorm = normalizeDepartment(currentUser?.department ?? null);
      const spaceNorm = normalizeDepartment(space.department);
      const nameNorm = normalizeDepartment(space.name);
      const workspaceNorm = normalizeDepartment(workspace?.department ?? null);
      const matchesOwnDept = Boolean(
        userNorm &&
          ((spaceNorm && isDepartmentMatch(userNorm, spaceNorm)) ||
            (!spaceNorm && nameNorm && (nameNorm.includes(userNorm) || userNorm.includes(nameNorm))) ||
            (!spaceNorm && !nameNorm && workspaceNorm && isDepartmentMatch(userNorm, workspaceNorm)))
      );
      if (!matchesOwnDept) {
        return res.status(403).json({ message: 'You can only create lists inside your own department.' });
      }
    }

    // Sanitize restriction payload: only workspace members can appear on the
    // allow-list, and the creator is always implicitly allowed.
    const wantsRestriction = Boolean(isRestricted);
    let safeAllowedUserIds = [];
    if (wantsRestriction) {
      const rawIds = Array.isArray(allowedUserIds) ? allowedUserIds : [];
      const uniqueIds = [...new Set(rawIds.filter((id) => typeof id === 'string' && id.trim()))];
      if (uniqueIds.length > 0) {
        const memberRows = await WorkspaceMember.find({
          workspaceId: space.workspaceId,
          userId: { $in: uniqueIds },
        }).lean();
        const memberSet = new Set(memberRows.map((m) => m.userId));
        safeAllowedUserIds = uniqueIds.filter((id) => memberSet.has(id));
      }
    }

    // Append new lists to the end of the space's visible order so the sidebar
    // stays stable for existing users. "End" == last active-list position + 1.
    const lastActive = await List.findOne({ spaceId, archivedAt: null })
      .sort({ position: -1, createdAt: -1 })
      .select({ position: 1 })
      .lean();
    const nextPosition = (lastActive?.position ?? 0) + 1;

    const list = await List.create({
      _id: randomUUID(),
      spaceId,
      name,
      createdBy: req.session.userId,
      isRestricted: wantsRestriction,
      allowedUserIds: safeAllowedUserIds,
      position: nextPosition,
    });
    res.json({
      list: serializeList(list.toObject()),
    });
  });

  /**
   * Update a restricted list's allow-list (or toggle the restriction off).
   * Only the list creator or a workspace admin may adjust access — this keeps
   * the default department behavior intact for anyone else.
   */
  router.patch('/lists/:listId/access', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const { isRestricted, allowedUserIds } = req.body ?? {};
    const list = await List.findById(listId);
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    const isAdmin = normalizeRoleForRestriction(role) === 'admin';
    const isCreator = list.createdBy === req.session.userId;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only the list creator or an admin can change access.' });
    }

    const nextRestricted = typeof isRestricted === 'boolean' ? isRestricted : Boolean(list.isRestricted);
    let nextAllowed = Array.isArray(list.allowedUserIds) ? [...list.allowedUserIds] : [];
    if (Array.isArray(allowedUserIds)) {
      const uniqueIds = [...new Set(allowedUserIds.filter((id) => typeof id === 'string' && id.trim()))];
      if (uniqueIds.length === 0) {
        nextAllowed = [];
      } else {
        const memberRows = await WorkspaceMember.find({
          workspaceId: space.workspaceId,
          userId: { $in: uniqueIds },
        }).lean();
        const memberSet = new Set(memberRows.map((m) => m.userId));
        nextAllowed = uniqueIds.filter((id) => memberSet.has(id));
      }
    }
    if (!nextRestricted) {
      nextAllowed = [];
    }

    list.isRestricted = nextRestricted;
    list.allowedUserIds = nextAllowed;
    await list.save();

    res.json({ list: serializeList(list.toObject()) });
  });

  router.patch('/lists/:listId', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const {
      kanbanColumnOrder,
      kanbanColumnLabels,
      addKanbanColumn,
      updateKanbanCustomColumn,
      deleteKanbanCustomColumn,
      deleteKanbanColumn,
      name,
      color,
      icon,
      description,
      defaultTaskType,
    } = req.body ?? {};
    const list = await List.findById(listId);
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    const isAppearanceUpdate =
      name !== undefined ||
      color !== undefined ||
      icon !== undefined ||
      description !== undefined ||
      defaultTaskType !== undefined;

    // Basic metadata (name / color / icon / description / default task type)
    // is editable by anyone who can manage lists (admin/manager/TL), PLUS
    // the list creator themselves. Column / kanban changes still require
    // `canManageStructure`.
    const canEditAppearance =
      canManageStructure(role) || list.createdBy === req.session.userId;
    if (isAppearanceUpdate && !canEditAppearance) {
      return res
        .status(403)
        .json({ message: 'Only the list creator, admin, manager, or team lead can rename or restyle this list.' });
    }
    if (!isAppearanceUpdate && !canManageStructure(role)) {
      return res.status(403).json({ message: 'Only admin, manager, or team lead can change board columns.' });
    }

    const hasWork =
      kanbanColumnOrder !== undefined ||
      kanbanColumnLabels !== undefined ||
      addKanbanColumn !== undefined ||
      updateKanbanCustomColumn !== undefined ||
      deleteKanbanCustomColumn !== undefined ||
      deleteKanbanColumn !== undefined ||
      isAppearanceUpdate;
    if (!hasWork) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const $set = {};

    if (name !== undefined) {
      const trimmed = String(name ?? '').trim().slice(0, 120);
      if (!trimmed) return res.status(400).json({ message: 'List name cannot be empty.' });
      $set.name = trimmed;
    }
    if (color !== undefined) {
      const raw = color === null ? null : String(color ?? '').trim();
      $set.color = raw ? normalizeHexColor(raw) : null;
    }
    if (icon !== undefined) {
      const raw = icon === null ? null : String(icon ?? '').trim().slice(0, 40);
      $set.icon = raw || null;
    }
    if (description !== undefined) {
      const raw = description === null ? null : String(description ?? '').slice(0, 500);
      $set.description = raw || null;
    }
    if (defaultTaskType !== undefined) {
      const allowed = ['task', 'milestone', 'form_response', 'meeting_note', 'process', 'project'];
      if (!allowed.includes(defaultTaskType)) {
        return res.status(400).json({ message: 'Invalid default task type.' });
      }
      $set.defaultTaskType = defaultTaskType;
    }

    if (addKanbanColumn !== undefined) {
      const label = String(addKanbanColumn.label ?? '')
        .trim()
        .slice(0, 80);
      if (!label) return res.status(400).json({ message: 'Column label required' });
      const color = normalizeHexColor(addKanbanColumn.color);
      const newId = `custom_${randomUUID().replace(/-/g, '')}`;
      const prevCustom = list.kanbanCustomColumns || [];
      const orderBase = resolveKanbanOrder({ ...list.toObject(), kanbanCustomColumns: prevCustom });
      $set.kanbanCustomColumns = [...prevCustom, { id: newId, label, color }];
      $set.kanbanColumnOrder = [...orderBase, newId];
    }

    if (updateKanbanCustomColumn !== undefined) {
      const colId = String(updateKanbanCustomColumn.id ?? '').trim();
      const label = String(updateKanbanCustomColumn.label ?? '')
        .trim()
        .slice(0, 80);
      if (!colId || !label) return res.status(400).json({ message: 'Invalid column' });
      const color =
        updateKanbanCustomColumn.color === undefined
          ? null
          : normalizeHexColor(updateKanbanCustomColumn.color);
      const cols = (addKanbanColumn !== undefined ? $set.kanbanCustomColumns : list.kanbanCustomColumns) || [];
      const idx = cols.findIndex((c) => c.id === colId);
      if (idx === -1) return res.status(400).json({ message: 'Unknown column' });
      const next = [...cols];
      next[idx] = {
        ...next[idx],
        label,
        ...(color ? { color } : {}),
      };
      $set.kanbanCustomColumns = next;
    }

    if (deleteKanbanCustomColumn !== undefined) {
      const colId = String(deleteKanbanCustomColumn.id ?? '').trim();
      if (!colId) return res.status(400).json({ message: 'Invalid column' });
      const cols = ($set.kanbanCustomColumns || list.kanbanCustomColumns) || [];
      const exists = cols.some((c) => c.id === colId);
      if (!exists) return res.status(400).json({ message: 'Unknown column' });
      $set.kanbanCustomColumns = cols.filter((c) => c.id !== colId);

      const orderSource = resolveKanbanOrder({
        ...list.toObject(),
        kanbanCustomColumns: $set.kanbanCustomColumns,
      });
      const orderBase = orderSource.filter((k) => k !== colId);
      $set.kanbanColumnOrder = normalizeKanbanColumnOrder(orderBase, {
        ...list.toObject(),
        kanbanCustomColumns: $set.kanbanCustomColumns,
      });

      const nextLabels =
        list.kanbanColumnLabels && typeof list.kanbanColumnLabels === 'object'
          ? { ...list.kanbanColumnLabels }
          : {};
      delete nextLabels[colId];
      $set.kanbanColumnLabels = nextLabels;

      // Keep tasks safe: move deleted-column tasks back to TO DO.
      await Task.updateMany({ listId: listId, status: colId }, { $set: { status: 'todo' } });
    }

    if (deleteKanbanColumn !== undefined) {
      const colId = String(deleteKanbanColumn.id ?? '').trim();
      if (!colId) return res.status(400).json({ message: 'Invalid column' });
      const currentOrder = resolveKanbanOrder({
        ...list.toObject(),
        ...$set,
      });
      if (!currentOrder.includes(colId)) return res.status(400).json({ message: 'Unknown column' });
      if (currentOrder.length <= 1) return res.status(400).json({ message: 'At least one column is required' });

      const nextOrder = currentOrder.filter((k) => k !== colId);
      const fallbackStatus = nextOrder[0];
      $set.kanbanColumnOrder = nextOrder;

      if (!TASK_STATUSES.includes(colId)) {
        const cols = ($set.kanbanCustomColumns || list.kanbanCustomColumns) || [];
        $set.kanbanCustomColumns = cols.filter((c) => c.id !== colId);
      }

      const labelsCurrent =
        $set.kanbanColumnLabels ||
        (list.kanbanColumnLabels && typeof list.kanbanColumnLabels === 'object'
          ? { ...list.kanbanColumnLabels }
          : {});
      delete labelsCurrent[colId];
      $set.kanbanColumnLabels = labelsCurrent;

      await Task.updateMany({ listId: listId, status: colId }, { $set: { status: fallbackStatus } });
    }

    if (kanbanColumnOrder !== undefined) {
      const merged = { ...list.toObject(), ...$set };
      const normalized = normalizeKanbanColumnOrder(kanbanColumnOrder, merged);
      if (!normalized) return res.status(400).json({ message: 'Invalid column order' });
      $set.kanbanColumnOrder = normalized;
    }

    if (kanbanColumnLabels !== undefined) {
      if (kanbanColumnLabels !== null && typeof kanbanColumnLabels !== 'object') {
        return res.status(400).json({ message: 'Invalid column labels' });
      }
      const prev =
        list.kanbanColumnLabels && typeof list.kanbanColumnLabels === 'object'
          ? { ...list.kanbanColumnLabels }
          : {};
      const incoming = kanbanColumnLabels || {};
      const customIds = (($set.kanbanCustomColumns || list.kanbanCustomColumns) || []).map((c) => c.id);
      const labelKeys = [...TASK_STATUSES, ...customIds];
      for (const k of labelKeys) {
        if (incoming[k] === undefined) continue;
        const s = String(incoming[k] ?? '').trim().slice(0, 80);
        if (s) prev[k] = s;
        else delete prev[k];
      }
      $set.kanbanColumnLabels = prev;
    }

    if (Object.keys($set).length === 0) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    await List.updateOne({ _id: listId }, { $set });
    const updated = await List.findById(listId).lean();
    res.json({ list: serializeList(updated) });
  });

  /**
   * Update a space's lightweight cosmetic fields (name / color / icon).
   * Only admin / manager / team-lead can edit; master "Team Space" folder
   * is immutable so its renaming doesn't desync clients.
   */
  router.patch('/spaces/:spaceId', requireAuth, async (req, res) => {
    const { spaceId } = req.params;
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    if (space.isMasterTeamSpace) {
      return res.status(400).json({ message: 'Master Team Space folder cannot be edited.' });
    }
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canManageStructure(role)) {
      return res.status(403).json({ message: 'Only admin/manager/team-lead can edit spaces' });
    }

    const updates = {};
    if (typeof req.body?.name === 'string') {
      const trimmed = req.body.name.trim();
      if (!trimmed) return res.status(400).json({ message: 'Name cannot be empty' });
      updates.name = trimmed;
    }
    if (req.body?.color !== undefined) {
      const c = req.body.color;
      updates.color = typeof c === 'string' && c.trim() ? c.trim() : null;
    }
    if (req.body?.icon !== undefined) {
      const ic = req.body.icon;
      updates.icon = typeof ic === 'string' && ic.trim() ? ic.trim().slice(0, 4) : null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    await Space.updateOne({ _id: spaceId }, { $set: updates });
    const fresh = await Space.findById(spaceId).lean();
    res.json({ space: serializeSpace(fresh) });
  });

  router.delete('/spaces/:spaceId', requireAuth, async (req, res) => {
    const { spaceId } = req.params;
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    if (space.isMasterTeamSpace) {
      return res.status(400).json({ message: 'Master Team Space folder cannot be deleted.' });
    }

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canDeleteSpace(role)) return res.status(403).json({ message: 'Only admin/manager can delete spaces' });

    const lists = await List.find({ spaceId }).lean();
    const listIds = lists.map((l) => l._id);
    const tasks = listIds.length ? await Task.find({ listId: { $in: listIds } }).lean() : [];
    const taskIds = tasks.map((t) => t._id);

    if (taskIds.length) {
      await Promise.all([
        TaskAssignee.deleteMany({ taskId: { $in: taskIds } }),
        TaskComment.deleteMany({ taskId: { $in: taskIds } }),
        Notification.deleteMany({ taskId: { $in: taskIds } }),
      ]);
    }
    if (listIds.length) {
      await List.deleteMany({ _id: { $in: listIds } });
    }
    await Task.deleteMany({ listId: { $in: listIds } });
    await Space.deleteOne({ _id: spaceId });

    res.json({ ok: true });
  });

  router.delete('/lists/:listId', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const list = await List.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canDeleteList(role)) return res.status(403).json({ message: 'Only admin/manager/team lead can delete lists' });

    // Shared cross-team list is admin-only infrastructure.
    if (list.isSharedMainList && role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can delete the shared cross-team list.' });
    }

    // Non-admins can only delete lists inside their OWN department.
    if (role !== 'admin') {
      const currentUser = await User.findById(req.session.userId).lean();
      const workspace = await Workspace.findById(space.workspaceId).lean();
      const userNorm = normalizeDepartment(currentUser?.department ?? null);
      const spaceNorm = normalizeDepartment(space.department);
      const nameNorm = normalizeDepartment(space.name);
      const workspaceNorm = normalizeDepartment(workspace?.department ?? null);
      const matchesOwnDept = Boolean(
        userNorm &&
          ((spaceNorm && isDepartmentMatch(userNorm, spaceNorm)) ||
            (!spaceNorm && nameNorm && (nameNorm.includes(userNorm) || userNorm.includes(nameNorm))) ||
            (!spaceNorm && !nameNorm && workspaceNorm && isDepartmentMatch(userNorm, workspaceNorm)))
      );
      if (!matchesOwnDept) {
        return res.status(403).json({ message: 'You can only delete lists inside your own department.' });
      }
    }

    const tasks = await Task.find({ listId }).lean();
    const taskIds = tasks.map((t) => t._id);
    if (taskIds.length) {
      await Promise.all([
        TaskAssignee.deleteMany({ taskId: { $in: taskIds } }),
        TaskComment.deleteMany({ taskId: { $in: taskIds } }),
        Notification.deleteMany({ taskId: { $in: taskIds } }),
      ]);
    }
    await Task.deleteMany({ listId });
    await List.deleteOne({ _id: listId });
    await UserListFavorite.deleteMany({ listId });

    res.json({ ok: true });
  });

  /**
   * Duplicate a list (metadata + tasks) inside the same space. Task IDs get
   * fresh UUIDs so the board can render both side-by-side without collisions.
   * Assignees / comments are intentionally NOT copied — those feel like
   * "thread" state the new list should start fresh with.
   */
  router.post('/lists/:listId/duplicate', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const source = await List.findById(listId).lean();
    if (!source) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(source.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canCreateList(role)) {
      return res.status(403).json({ message: 'Only admin, manager, or team lead can duplicate lists.' });
    }

    const lastActive = await List.findOne({ spaceId: source.spaceId, archivedAt: null })
      .sort({ position: -1, createdAt: -1 })
      .select({ position: 1 })
      .lean();
    const nextPosition = (lastActive?.position ?? 0) + 1;

    const newListId = randomUUID();
    const copy = await List.create({
      _id: newListId,
      spaceId: source.spaceId,
      folderId: source.folderId ?? null,
      name: `${source.name} (copy)`.slice(0, 120),
      createdBy: req.session.userId,
      // Duplicate never inherits restrictions — the caller can re-restrict it
      // from the access modal. Keeps the action predictable and safe.
      isRestricted: false,
      allowedUserIds: [],
      position: nextPosition,
      color: source.color ?? null,
      icon: source.icon ?? null,
      description: source.description ?? null,
      defaultTaskType: source.defaultTaskType ?? 'task',
      kanbanColumnOrder: source.kanbanColumnOrder ?? undefined,
      kanbanColumnLabels: source.kanbanColumnLabels ?? undefined,
      kanbanCustomColumns: source.kanbanCustomColumns ?? undefined,
    });

    const sourceTasks = await Task.find({ listId: source._id, parentTaskId: null }).lean();
    if (sourceTasks.length) {
      const cloned = sourceTasks.map((t) => ({
        _id: randomUUID(),
        listId: newListId,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        priority: t.priority,
        startDate: t.startDate ?? null,
        dueDate: t.dueDate ?? null,
        createdBy: req.session.userId,
        parentTaskId: null,
        checklist: Array.isArray(t.checklist)
          ? t.checklist.map((c) => ({ ...c, done: false, assigneeIds: [] }))
          : [],
        relatedTaskIds: [],
        defaultPermission: t.defaultPermission ?? 'full_edit',
        collaborators: [],
        isPrivate: false,
      }));
      await Task.insertMany(cloned);
    }

    res.json({ list: serializeList(copy.toObject(), { favoriteIds: new Set() }) });
  });

  /**
   * Reorder lists within a single space. The client sends the full ordered
   * array of list ids (restricted to active, i.e. non-archived lists) and we
   * assign tight monotonically-increasing positions. Skipped ids fall back to
   * their previous position so partial payloads are safe.
   */
  router.post('/lists/reorder', requireAuth, async (req, res) => {
    const { spaceId, orderedListIds } = req.body ?? {};
    if (!spaceId || !Array.isArray(orderedListIds) || orderedListIds.length === 0) {
      return res.status(400).json({ message: 'spaceId and orderedListIds[] are required.' });
    }
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canManageStructure(role)) {
      return res.status(403).json({ message: 'Only admin, manager, or team lead can reorder lists.' });
    }

    const rows = await List.find({ spaceId, archivedAt: null })
      .select({ _id: 1 })
      .lean();
    const validIds = new Set(rows.map((r) => r._id));
    const filtered = orderedListIds.filter((id) => typeof id === 'string' && validIds.has(id));
    if (filtered.length === 0) {
      return res.status(400).json({ message: 'No matching active lists in that space.' });
    }

    // Normalize: the ids the client sent get positions 1..N. Any active list
    // NOT in the payload keeps its relative order at the tail (position > N).
    const ops = [];
    filtered.forEach((id, idx) => {
      ops.push({
        updateOne: { filter: { _id: id }, update: { $set: { position: idx + 1 } } },
      });
    });
    if (ops.length) {
      await List.bulkWrite(ops);
    }

    res.json({ ok: true });
  });

  /**
   * Soft-archive a list so the sidebar + default navigation drop it. Tasks
   * and associated state are preserved; users can restore from the "Archived
   * lists" panel. Admins or the list creator may archive.
   */
  router.post('/lists/:listId/archive', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const list = await List.findById(listId);
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    const isAdmin = role === 'admin';
    const isCreator = list.createdBy === req.session.userId;
    if (!isAdmin && !isCreator && !canDeleteList(role)) {
      return res.status(403).json({ message: 'Not allowed to archive this list.' });
    }
    if (list.isSharedMainList && !isAdmin) {
      return res.status(403).json({ message: 'Only admin can archive the shared cross-team list.' });
    }

    if (!list.archivedAt) {
      list.archivedAt = new Date();
      await list.save();
    }
    res.json({ list: serializeList(list.toObject(), { favoriteIds: new Set() }) });
  });

  /** Restore an archived list back into the sidebar. */
  router.post('/lists/:listId/unarchive', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const list = await List.findById(listId);
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    const isAdmin = role === 'admin';
    const isCreator = list.createdBy === req.session.userId;
    if (!isAdmin && !isCreator && !canDeleteList(role)) {
      return res.status(403).json({ message: 'Not allowed to restore this list.' });
    }

    if (list.archivedAt) {
      const lastActive = await List.findOne({ spaceId: list.spaceId, archivedAt: null })
        .sort({ position: -1, createdAt: -1 })
        .select({ position: 1 })
        .lean();
      list.archivedAt = null;
      list.position = (lastActive?.position ?? 0) + 1;
      await list.save();
    }
    res.json({ list: serializeList(list.toObject(), { favoriteIds: new Set() }) });
  });

  /**
   * List the archived lists in a space so the "Archived" modal can render
   * them. Respects the same department-scope rule as navigation so a random
   * employee can't peek into other departments' archives.
   */
  router.get('/spaces/:spaceId/archived-lists', requireAuth, async (req, res) => {
    const { spaceId } = req.params;
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canManageStructure(role)) {
      return res.status(403).json({ message: 'Not allowed to view archived lists here.' });
    }
    const rows = await List.find({ spaceId, archivedAt: { $ne: null } })
      .sort({ archivedAt: -1 })
      .lean();
    res.json({ lists: await serializeListsForUser(rows, req.session.userId) });
  });

  /** Toggle the current user's "favorite" flag on a list. */
  router.post('/lists/:listId/favorite', requireAuth, async (req, res) => {
    const { listId } = req.params;
    const list = await List.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    // Favorites are purely user-local: anyone who can see the list in the
    // sidebar may also favorite it. We just make sure the viewer has some
    // connection to the workspace via membership.
    const member = await WorkspaceMember.findOne({ userId: req.session.userId }).lean();
    if (!member) return res.status(403).json({ message: 'No workspace access.' });

    await UserListFavorite.updateOne(
      { userId: req.session.userId, listId },
      { $setOnInsert: { userId: req.session.userId, listId } },
      { upsert: true }
    );
    res.json({ ok: true, is_favorited: true });
  });

  router.delete('/lists/:listId/favorite', requireAuth, async (req, res) => {
    const { listId } = req.params;
    await UserListFavorite.deleteOne({ userId: req.session.userId, listId });
    res.json({ ok: true, is_favorited: false });
  });

  router.post('/workspaces/:workspaceId/invite', requireAuth, async (req, res) => {
    const { workspaceId } = req.params;
    const { email, role, department } = req.body ?? {};
    const targetRole = ['employee', 'team_lead', 'manager', 'admin'].includes(role) ? role : 'employee';
    const normalizedEmail = String(email || '').toLowerCase().trim();
    if (!normalizedEmail) return res.status(400).json({ message: 'Valid email required' });
    const currentRole = await getRole(workspaceId, req.session.userId);
    if (!canInviteMembers(currentRole)) return res.status(403).json({ message: 'Only admin can invite members' });
    const user = await User.findOne({ email: normalizedEmail });
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    const inviteDepartment = String(department || '').trim() || workspace.department;
    if (targetRole === 'team_lead') {
      const existingTeamLead = await findTeamLeadForDepartment(workspaceId, inviteDepartment, user?._id ?? null);
      if (existingTeamLead) {
        return res.status(409).json({
          message: `Department already has a team lead (${existingTeamLead.displayName || existingTeamLead.email}).`,
        });
      }
    }

    if (!user) {
      await WorkspaceInvite.updateOne(
        { workspaceId, email: normalizedEmail },
        {
          $set: {
            role: targetRole,
            department: inviteDepartment,
            invitedBy: req.session.userId,
            status: 'pending',
          },
          $setOnInsert: { _id: randomUUID() },
        },
        { upsert: true }
      );
      const emailResult = await sendInviteEmail({
        to: normalizedEmail,
        workspaceName: workspace.name,
        role: targetRole,
        department: inviteDepartment,
      }).catch(() => ({ sent: false, reason: 'Failed to send email' }));
      return res.json({
        ok: true,
        pending: true,
        emailSent: Boolean(emailResult?.sent),
        message: emailResult?.sent
          ? 'Invite email sent successfully.'
          : 'Invite saved. SMTP not configured or email failed; role will still apply on signup.',
      });
    }
    if (targetRole !== 'admin') {
      if (user.department && user.department !== inviteDepartment) {
        return res.status(403).json({ message: `User department mismatch. Expected ${inviteDepartment}.` });
      }
      if (!user.department) {
        await User.updateOne({ _id: user._id }, { $set: { department: inviteDepartment } });
      }
    }
    await WorkspaceMember.updateOne(
      { workspaceId, userId: user._id },
      { $set: { invitedBy: req.session.userId } },
      { upsert: true }
    );
    await UserRole.updateOne({ workspaceId, userId: user._id }, { $set: { role: targetRole } }, { upsert: true });
    await WorkspaceInvite.updateOne(
      { workspaceId, email: normalizedEmail },
      {
        $set: {
          role: targetRole,
          department: inviteDepartment,
          invitedBy: req.session.userId,
          status: 'accepted',
        },
        $setOnInsert: { _id: randomUUID() },
      },
      { upsert: true }
    );
    const emailResult = await sendInviteEmail({
      to: normalizedEmail,
      workspaceName: workspace.name,
      role: targetRole,
      department: inviteDepartment,
    }).catch(() => ({ sent: false, reason: 'Failed to send email' }));
    res.json({
      ok: true,
      pending: false,
      emailSent: Boolean(emailResult?.sent),
      message: emailResult?.sent
        ? 'Invite email sent successfully.'
        : 'Invite applied for existing user, but email delivery failed.',
    });
  });

  /**
   * Admin-only: read + update the workspace's overdue notification settings.
   * These apply to every department/space inside the workspace.
   */
  /**
   * Build the serialisable settings payload. Kept in one place so GET + PUT
   * stay in sync.
   */
  const serializeOverdueSettings = (workspace) => ({
    enabled: Boolean(workspace.overdueNotificationsEnabled),
    intervalMinutes: Number(workspace.overdueNotificationIntervalMinutes || 30),
    officeHoursStart: Number(workspace.officeHoursStart ?? 10),
    officeHoursEnd: Number(workspace.officeHoursEnd ?? 19),
  });

  router.get('/workspaces/:workspaceId/settings/overdue', requireAuth, async (req, res) => {
    const { workspaceId } = req.params;
    const role = await getRole(workspaceId, req.session.userId);
    if (!canManageWorkspace(role)) {
      return res.status(403).json({ message: 'Only admin can view overdue settings.' });
    }
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    res.json(serializeOverdueSettings(workspace));
  });

  router.put('/workspaces/:workspaceId/settings/overdue', requireAuth, async (req, res) => {
    const { workspaceId } = req.params;
    const role = await getRole(workspaceId, req.session.userId);
    if (!canManageWorkspace(role)) {
      return res.status(403).json({ message: 'Only admin can update overdue settings.' });
    }
    const { enabled, intervalMinutes, officeHoursStart, officeHoursEnd } = req.body ?? {};
    const update = {};
    if (typeof enabled === 'boolean') update.overdueNotificationsEnabled = enabled;
    if (Number.isFinite(Number(intervalMinutes))) {
      const minutes = Math.max(1, Math.min(1440, Math.round(Number(intervalMinutes))));
      update.overdueNotificationIntervalMinutes = minutes;
    }
    // Normalise office-hours bounds. Start is 0–23, end is 1–24 (24 = midnight
    // of the next day). Valid windows: start !== end after modding 24.
    const clampStart = (v) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(23, n));
    };
    const clampEnd = (v) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return null;
      return Math.max(1, Math.min(24, n));
    };
    const startClean = officeHoursStart !== undefined ? clampStart(officeHoursStart) : null;
    const endClean = officeHoursEnd !== undefined ? clampEnd(officeHoursEnd) : null;
    if (startClean !== null) update.officeHoursStart = startClean;
    if (endClean !== null) update.officeHoursEnd = endClean;
    if (
      startClean !== null &&
      endClean !== null &&
      startClean === endClean % 24
    ) {
      return res
        .status(400)
        .json({ message: 'Office hours start and end cannot be the same.' });
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Nothing to update.' });
    }
    const workspace = await Workspace.findByIdAndUpdate(workspaceId, { $set: update }, { new: true }).lean();
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    res.json(serializeOverdueSettings(workspace));
  });

  /**
   * Walks every task that is not yet complete and has a due date, and returns
   * the ones whose list or space has been deleted (i.e. the task is an orphan
   * the scheduler can never notify because it can't resolve a workspace). The
   * admin UI uses this to show a "Clean up" button.
   */
  async function findOrphanTasks() {
    const tasks = await Task.find({
      dueDate: { $ne: null },
      status: { $ne: 'complete' },
    })
      .select({ _id: 1, title: 1, dueDate: 1, listId: 1, status: 1, createdBy: 1 })
      .lean();
    if (tasks.length === 0) return [];
    const listIds = [...new Set(tasks.map((t) => t.listId).filter(Boolean))];
    const lists = await List.find({ _id: { $in: listIds } })
      .select({ _id: 1, spaceId: 1 })
      .lean();
    const listMap = new Map(lists.map((l) => [l._id, l]));
    const spaceIds = [...new Set(lists.map((l) => l.spaceId).filter(Boolean))];
    const spaces = await Space.find({ _id: { $in: spaceIds } })
      .select({ _id: 1, workspaceId: 1 })
      .lean();
    const spaceMap = new Map(spaces.map((s) => [s._id, s]));

    const orphans = [];
    for (const task of tasks) {
      const list = task.listId ? listMap.get(task.listId) : null;
      if (!list) {
        orphans.push({ ...task, reason: 'list-missing' });
        continue;
      }
      const space = list.spaceId ? spaceMap.get(list.spaceId) : null;
      if (!space) {
        orphans.push({ ...task, reason: 'space-missing', listId: task.listId });
        continue;
      }
      if (!space.workspaceId) {
        orphans.push({ ...task, reason: 'space-has-no-workspace', listId: task.listId });
      }
    }
    return orphans;
  }

  /**
   * Admin-only: list every orphan task in the system (task exists but its
   * list/space chain is broken, so notifications can't be routed). Only admins
   * of the given workspace can call this; the result spans the whole DB
   * because orphan tasks by definition have no resolvable workspace.
   */
  router.get(
    '/workspaces/:workspaceId/maintenance/orphan-tasks',
    requireAuth,
    async (req, res) => {
      const { workspaceId } = req.params;
      const role = await getRole(workspaceId, req.session.userId);
      if (!canManageWorkspace(role)) {
        return res.status(403).json({ message: 'Only admin can inspect orphan tasks.' });
      }
      const orphans = await findOrphanTasks();
      res.json({
        count: orphans.length,
        tasks: orphans.map((t) => ({
          id: t._id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          listId: t.listId || null,
          reason: t.reason,
        })),
      });
    },
  );

  /**
   * Admin-only: delete every orphan task + its assignee rows so the scheduler
   * stops skipping them. This is destructive but safe — orphan tasks have no
   * parent list/space so they're already unreachable from the UI.
   */
  router.delete(
    '/workspaces/:workspaceId/maintenance/orphan-tasks',
    requireAuth,
    async (req, res) => {
      const { workspaceId } = req.params;
      const role = await getRole(workspaceId, req.session.userId);
      if (!canManageWorkspace(role)) {
        return res.status(403).json({ message: 'Only admin can delete orphan tasks.' });
      }
      const orphans = await findOrphanTasks();
      if (orphans.length === 0) return res.json({ deleted: 0 });
      const ids = orphans.map((t) => t._id);
      await TaskAssignee.deleteMany({ taskId: { $in: ids } });
      await Notification.deleteMany({ taskId: { $in: ids } });
      const result = await Task.deleteMany({ _id: { $in: ids } });
      res.json({ deleted: result.deletedCount || 0 });
    },
  );

  router.patch('/workspaces/:workspaceId/members/:memberId/role', requireAuth, async (req, res) => {
    const { workspaceId, memberId } = req.params;
    const { role } = req.body ?? {};
    const nextRole = ['employee', 'team_lead', 'manager', 'admin'].includes(role) ? role : null;
    if (!nextRole) return res.status(400).json({ message: 'Invalid role' });

    const currentRole = await getRole(workspaceId, req.session.userId);
    if (!canManageWorkspace(currentRole)) return res.status(403).json({ message: 'Only admin can change roles' });

    const memberExists = await WorkspaceMember.findOne({ workspaceId, userId: memberId }).lean();
    if (!memberExists) return res.status(404).json({ message: 'Member not found in workspace' });

    if (nextRole === 'team_lead') {
      const targetUser = await User.findById(memberId).lean();
      if (!targetUser?.department) {
        return res.status(400).json({ message: 'Team lead must have a department assigned.' });
      }
      const existingTeamLead = await findTeamLeadForDepartment(workspaceId, targetUser.department, memberId);
      if (existingTeamLead) {
        return res.status(409).json({
          message: `Department already has a team lead (${existingTeamLead.displayName || existingTeamLead.email}).`,
        });
      }
    }

    await UserRole.updateOne({ workspaceId, userId: memberId }, { $set: { role: nextRole } }, { upsert: true });
    res.json({ ok: true });
  });

  router.post('/tasks', requireAuth, async (req, res) => {
    const { listId, title, status, priority, startDate, endDate, description, parentTaskId } = req.body ?? {};
    /** Assignees (task owners). Legacy: `notifyUserIds` used to mean the same. */
    let assigneeIds = Array.isArray(req.body.assigneeIds) ? req.body.assigneeIds : [];
    if (assigneeIds.length === 0 && Array.isArray(req.body.notifyUserIds)) {
      assigneeIds = req.body.notifyUserIds;
    }
    /** Bell / voucher: notify only — no TaskAssignee row */
    const notifyOnlyUserIds = Array.isArray(req.body.notifyOnlyUserIds) ? req.body.notifyOnlyUserIds : [];
    const list = await List.findById(listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const currentUser = await User.findById(req.session.userId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canCreateTasks(role)) return res.status(403).json({ message: 'No permission' });
    if (
      !canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    ) {
      return res.status(403).json({ message: 'Space department access blocked' });
    }

    let st = typeof status === 'string' ? status : 'todo';
    if (!isValidTaskStatusForList(list, st)) st = 'todo';

    // Validate the parent reference: must be an existing task in the same list.
    let safeParentId = null;
    if (typeof parentTaskId === 'string' && parentTaskId.trim()) {
      const parent = await Task.findById(parentTaskId.trim()).lean();
      if (parent && parent.listId === listId) {
        safeParentId = parent._id;
      }
    }

    const task = await Task.create({
      _id: randomUUID(),
      listId,
      title,
      description: typeof description === 'string' ? description : undefined,
      status: st,
      priority,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: endDate ? new Date(endDate) : null,
      createdBy: req.session.userId,
      isBeingCreated: true,
      parentTaskId: safeParentId,
    });

    const workspaceMembers = await WorkspaceMember.find({ workspaceId: space.workspaceId }).lean();
    const workspaceMemberIds = new Set(workspaceMembers.map((row) => row.userId));
    const normalizeIds = (arr) =>
      [...new Set(arr.map((id) => String(id).trim()).filter((id) => workspaceMemberIds.has(id)))];
    const assignedUserIds = normalizeIds(assigneeIds);
    const actorName = currentUser?.displayName || currentUser?.email || 'Someone';

    if (assignedUserIds.length > 0) {
      await TaskAssignee.insertMany(
        assignedUserIds.map((userId) => ({
          taskId: task._id,
          userId,
        })),
        { ordered: false }
      ).catch(() => {});
    }

    const assigneeSet = new Set(assignedUserIds);
    const notifyOnlyFiltered = normalizeIds(notifyOnlyUserIds).filter((id) => !assigneeSet.has(id));

    // Mark creation complete, then send exactly one creation notification.
    await Task.updateOne({ _id: task._id }, { $set: { isBeingCreated: false } });

    await createNotifications({
      userIds: [req.session.userId],
      workspaceId: space.workspaceId,
      taskId: task._id,
      type: 'task_created',
      message: `${actorName} created task ${task.title}`,
      realtime: rt,
    });

    // Activity timeline entries for task detail panel (not bell notifications).
    const assigneeUsers = assignedUserIds.length
      ? await User.find({ _id: { $in: assignedUserIds } }).lean()
      : [];
    const assigneeNames = assigneeUsers.map((u) => u.displayName || u.email || 'Unknown user');
    const creationActivityMessages = [`${actorName} created this task`];
    if (task.priority) {
      creationActivityMessages.push(`${actorName} set priority to ${labelTaskPriority(task.priority)}`);
    }
    if (task.dueDate) {
      creationActivityMessages.push(`${actorName} set the due date to ${labelTaskDueDate(task.dueDate)}`);
    }
    if (assigneeNames.length > 0) {
      creationActivityMessages.push(`${actorName} assigned to: ${assigneeNames.join(', ')}`);
    }
    await TaskComment.insertMany(
      creationActivityMessages.map((content) => ({
        _id: randomUUID(),
        taskId: task._id,
        userId: req.session.userId,
        content,
        attachments: [],
        parentCommentId: null,
        isActivity: true,
      })),
      { ordered: false }
    ).catch(() => {});

    if (assignedUserIds.length > 0) {
      // Email assignees (exclude the creator so they don't email themselves).
      const emailRecipients = assignedUserIds.filter((id) => id !== req.session.userId);
      if (emailRecipients.length > 0) {
        try {
          const recipients = await User.find({ _id: { $in: emailRecipients } }).lean();
          const assignedByName = currentUser?.displayName || currentUser?.email || 'A teammate';
          const dueDateStr = task.dueDate ? task.dueDate.toLocaleDateString('en-GB') : null;
          await Promise.allSettled(
            recipients
              .filter((u) => u.email)
              .map((u) =>
                sendTaskAssignedEmail({
                  to: u.email,
                  taskTitle: task.title,
                  taskId: task._id,
                  priority: task.priority,
                  dueDate: dueDateStr,
                  assignedByName,
                  workspaceName: workspace?.name,
                })
              )
          );
        } catch (err) {
          console.error('Failed to send task-assigned emails', err);
        }
      }
    }

    // notifyOnly users are ignored for creation bell notifications by design.

    const dto = taskToDTO(task.toObject(), assignedUserIds);
    rt.broadcast('task:created', { task: dto, list_id: listId });
    res.json({ task: dto });
  });

  router.patch('/tasks/:taskId/status', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const { status } = req.body ?? {};
    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    const space = await Space.findById(list.spaceId).lean();
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const currentUser = await User.findById(req.session.userId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canUpdateTask(role)) return res.status(403).json({ message: 'No permission' });
    if (
      !canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    ) {
      return res.status(403).json({ message: 'Space department access blocked' });
    }
    if (!isValidTaskStatusForList(list, status)) {
      return res.status(400).json({ message: 'Invalid status for this list' });
    }
    // Employees can shuffle task status inside their own team space.

    const previousStatus = task.status;
    if (task.isBeingCreated) {
      return res.json({ ok: true });
    }
    // When a task transitions to "complete" we also clear the overdue-
    // notification flags so any stale "lastOverdueNotifiedAt" doesn't cause
    // odd behaviour if it's later reopened. When transitioning away from
    // "complete" we reset them too so reminders resume cleanly for the
    // re-opened task.
    const statusUpdate = { status };
    if (status === 'complete' || previousStatus === 'complete') {
      statusUpdate.lastOverdueNotifiedAt = null;
      statusUpdate.dueSoonNotifiedAt = null;
    }
    await Task.updateOne({ _id: taskId }, { $set: statusUpdate });
    const assignees = await TaskAssignee.find({ taskId }).lean();

    const actorName = currentUser?.displayName || currentUser?.email || 'Someone';
    await createNotifications({
      userIds: [...new Set(assignees.map((row) => row.userId).filter(Boolean))].filter(
        (id) => id !== req.session.userId
      ),
      workspaceId: space.workspaceId,
      taskId,
      type: 'task_status_changed',
      message: `${actorName} changed status to ${labelTaskStatus(status)} in task ${task.title}`,
      realtime: rt,
    });
    await createTaskActivityEntry({
      taskId,
      userId: req.session.userId,
      content: `${actorName} changed status to ${labelTaskStatus(status)} in task ${task.title}`,
    });

    // Email on transition to "complete" only — skip duplicates / other updates.
    if (status === 'complete' && previousStatus !== 'complete') {
      try {
        const assigneeIds = assignees.map((a) => a.userId);
        const creatorId = task.createdBy;
        const recipientIds = [...new Set([...assigneeIds, creatorId].filter(Boolean))].filter(
          (id) => id !== req.session.userId
        );
        if (recipientIds.length > 0) {
          const recipients = await User.find({ _id: { $in: recipientIds } }).lean();
          const completedByName = currentUser?.displayName || currentUser?.email || 'Someone';
          await Promise.allSettled(
            recipients
              .filter((u) => u.email)
              .map((u) =>
                sendTaskCompletedEmail({
                  to: u.email,
                  taskTitle: task.title,
                  taskId,
                  completedByName,
                  workspaceName: workspace?.name,
                })
              )
          );
        }
      } catch (err) {
        console.error('Failed to send task-completed emails', err);
      }
    }

    rt.broadcast('task:updated', {
      task_id: taskId,
      list_id: task.listId,
      patch: { status },
    });
    res.json({ ok: true });
  });

  router.patch('/tasks/:taskId', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const {
      title,
      description,
      status,
      priority,
      startDate,
      endDate,
      assigneeIds,
      checklist,
      relatedTaskIds,
      defaultPermission,
      collaborators,
      isPrivate,
    } = req.body ?? {};
    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const currentUser = await User.findById(req.session.userId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canUpdateTask(role)) return res.status(403).json({ message: 'No permission' });
    if (
      !canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    ) {
      return res.status(403).json({ message: 'Space department access blocked' });
    }
    if (role === 'employee') {
      const isAssigned = await TaskAssignee.findOne({ taskId, userId: req.session.userId }).lean();
      const canTouch = task.createdBy === req.session.userId || Boolean(isAssigned);
      if (!canTouch) return res.status(403).json({ message: 'Employees can update only their own/assigned tasks' });
    }
    const previousAssigneeRows = await TaskAssignee.find({ taskId }).lean();
    const previousAssigneeIds = [...new Set(previousAssigneeRows.map((row) => row.userId).filter(Boolean))];
    const skipNotificationsForCreationFlow = Boolean(task.isBeingCreated);

    const updates = {};
    if (typeof title === 'string') updates.title = title.trim() || task.title;
    if (typeof description === 'string') updates.description = description;
    if (typeof status === 'string') {
      if (!isValidTaskStatusForList(list, status)) {
        return res.status(400).json({ message: 'Invalid status for this list' });
      }
      updates.status = status;
      // Same hygiene as PATCH /tasks/:id/status — reset the overdue flags on
      // any transition in/out of 'complete' so reminders resume cleanly if
      // the task is later reopened.
      if (status === 'complete' || task.status === 'complete') {
        updates.lastOverdueNotifiedAt = null;
        updates.dueSoonNotifiedAt = null;
      }
    }
    if (typeof priority === 'string') updates.priority = priority;
    if (typeof startDate !== 'undefined') updates.startDate = startDate ? new Date(startDate) : null;
    if (typeof endDate !== 'undefined') {
      const nextDue = endDate ? new Date(endDate) : null;
      updates.dueDate = nextDue;
      // If the due date actually moved (or was cleared / set), reset the
      // overdue + due-soon notification flags so the scheduler re-evaluates
      // the task against the new date. Without this, pushing a date out by
      // a week would leave `dueSoonNotifiedAt` set and the next "due
      // tomorrow" reminder would never fire.
      const prevDueMs = task.dueDate ? new Date(task.dueDate).getTime() : null;
      const nextDueMs = nextDue ? nextDue.getTime() : null;
      if (prevDueMs !== nextDueMs) {
        updates.dueSoonNotifiedAt = null;
        updates.lastOverdueNotifiedAt = null;
      }
    }

    // Checklist: replace entire array when provided. Normalize items.
    if (Array.isArray(checklist)) {
      updates.checklist = checklist
        .map((item) => ({
          id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
          text: typeof item?.text === 'string' ? item.text.slice(0, 500) : '',
          done: Boolean(item?.done),
          assigneeIds: Array.isArray(item?.assigneeIds)
            ? [...new Set(item.assigneeIds.map((x) => String(x).trim()).filter(Boolean))].slice(0, 20)
            : [],
        }))
        .filter((item) => item.text.trim().length > 0)
        .slice(0, 200);
    }

    // Related tasks: replace entire list; validate ids exist and exclude self.
    if (Array.isArray(relatedTaskIds)) {
      const ids = [...new Set(relatedTaskIds.map((id) => String(id).trim()).filter(Boolean))].filter(
        (id) => id !== taskId
      );
      if (ids.length > 0) {
        const existing = await Task.find({ _id: { $in: ids } }, { _id: 1 }).lean();
        updates.relatedTaskIds = existing.map((t) => t._id);
      } else {
        updates.relatedTaskIds = [];
      }
    }

    // Share-dialog fields: per-task default permission + per-user collaborator roles.
    const PERMISSION_VALUES = ['full_edit', 'edit', 'comment', 'view'];
    if (typeof defaultPermission === 'string') {
      if (!PERMISSION_VALUES.includes(defaultPermission)) {
        return res.status(400).json({ message: 'Invalid default permission' });
      }
      updates.defaultPermission = defaultPermission;
    }
    if (Array.isArray(collaborators)) {
      // De-dupe by userId (last occurrence wins), drop empty ids, clamp to 100 entries.
      const seen = new Map();
      for (const c of collaborators) {
        const uid = String(c?.userId || '').trim();
        if (!uid) continue;
        const r = String(c?.role || 'full_edit');
        const role = PERMISSION_VALUES.includes(r) ? r : 'full_edit';
        seen.set(uid, role);
      }
      updates.collaborators = Array.from(seen.entries())
        .slice(0, 100)
        .map(([userId, role]) => ({ userId, role, addedAt: new Date() }));
    }
    if (typeof isPrivate === 'boolean') {
      updates.isPrivate = isPrivate;
    }

    if (Object.keys(updates).length > 0) {
      await Task.updateOne({ _id: taskId }, { $set: updates });
    }

    if (Array.isArray(assigneeIds)) {
      await TaskAssignee.deleteMany({ taskId });
      if (assigneeIds.length > 0) {
        await TaskAssignee.insertMany(assigneeIds.map((userId) => ({ taskId, userId })), { ordered: false }).catch(() => {});
      }
    }

    const refreshed = await Task.findById(taskId).lean();
    const assignees = await TaskAssignee.find({ taskId }).lean();
    const nextAssigneeIds = [...new Set(assignees.map((row) => row.userId).filter(Boolean))];

    const actorName = currentUser?.displayName || currentUser?.email || 'Someone';
    const changedMessages = [];
    if (typeof title === 'string' && title.trim() && title.trim() !== task.title) {
      changedMessages.push(`${actorName} renamed task to ${title.trim()}`);
    }
    if (typeof description === 'string' && description !== (task.description ?? '')) {
      changedMessages.push(`${actorName} updated description in task ${task.title}`);
    }
    if (typeof status === 'string' && status !== task.status) {
      changedMessages.push(
        `${actorName} changed status to ${labelTaskStatus(status)} in task ${task.title}`
      );
    }
    if (typeof priority === 'string' && priority !== task.priority) {
      changedMessages.push(
        `${actorName} changed priority from ${labelTaskPriority(task.priority)} to ${labelTaskPriority(priority)} in task ${task.title}`
      );
    }
    if (typeof endDate !== 'undefined') {
      const nextDueLabel = labelTaskDueDate(refreshed?.dueDate);
      const previousDueLabel = labelTaskDueDate(task.dueDate);
      if (previousDueLabel !== nextDueLabel) {
        changedMessages.push(
          `${actorName} updated due date to ${nextDueLabel} in task ${task.title}`
        );
      }
    }
    const prevSet = new Set(previousAssigneeIds);
    const nextSet = new Set(nextAssigneeIds);
    const assigneeChanged =
      previousAssigneeIds.length !== nextAssigneeIds.length
      || previousAssigneeIds.some((id) => !nextSet.has(id))
      || nextAssigneeIds.some((id) => !prevSet.has(id));
    if (assigneeChanged) {
      const assigneeUserIds = [...new Set([...previousAssigneeIds, ...nextAssigneeIds])];
      const assigneeUsers = assigneeUserIds.length
        ? await User.find({ _id: { $in: assigneeUserIds } }).lean()
        : [];
      const userNameById = Object.fromEntries(
        assigneeUsers.map((u) => [u._id, u.displayName || u.email || 'Unknown user'])
      );
      const addedIds = nextAssigneeIds.filter((id) => !prevSet.has(id));
      const addedNames = addedIds.map((id) => userNameById[id] ?? 'Unknown user');

      if (addedIds.length > 0) {
        changedMessages.push(
          `${actorName} added ${addedNames.join(', ')} as ${addedIds.length > 1 ? 'assignees' : 'assignee'} in task ${task.title}`
        );
      }
    }
    if (!skipNotificationsForCreationFlow && changedMessages.length > 0 && nextAssigneeIds.length > 0) {
      for (const message of changedMessages) {
        await createNotifications({
          userIds: nextAssigneeIds.filter((id) => id !== req.session.userId),
          workspaceId: space.workspaceId,
          taskId,
          type: 'task_status_changed',
          message,
          realtime: rt,
        });
      }
    }
    if (!skipNotificationsForCreationFlow && changedMessages.length > 0) {
      for (const message of changedMessages) {
        await createTaskActivityEntry({
          taskId,
          userId: req.session.userId,
          content: message,
        });
      }
    }

    // Email on transition to "complete" from the full-edit dialog too.
    if (typeof status === 'string' && status === 'complete' && task.status !== 'complete') {
      try {
        const assigneeIdsFinal = assignees.map((a) => a.userId);
        const recipientIds = [...new Set([...assigneeIdsFinal, refreshed.createdBy].filter(Boolean))].filter(
          (id) => id !== req.session.userId
        );
        if (recipientIds.length > 0) {
          const recipients = await User.find({ _id: { $in: recipientIds } }).lean();
          const completedByName = currentUser?.displayName || currentUser?.email || 'Someone';
          await Promise.allSettled(
            recipients
              .filter((u) => u.email)
              .map((u) =>
                sendTaskCompletedEmail({
                  to: u.email,
                  taskTitle: refreshed.title,
                  taskId,
                  completedByName,
                  workspaceName: workspace?.name,
                })
              )
          );
        }
      } catch (err) {
        console.error('Failed to send task-completed emails (patch)', err);
      }
    }
    const patchDto = taskToDTO(refreshed, assignees.map((a) => a.userId));
    rt.broadcast('task:updated', {
      task_id: taskId,
      list_id: refreshed.listId,
      task: patchDto,
    });
    res.json({ task: patchDto });
  });

  router.delete('/tasks/:taskId', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const currentUser = await User.findById(req.session.userId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canUpdateTask(role)) return res.status(403).json({ message: 'No permission' });
    if (
      !canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    ) {
      return res.status(403).json({ message: 'Space department access blocked' });
    }
    if (role === 'employee') {
      const isAssigned = await TaskAssignee.findOne({ taskId, userId: req.session.userId }).lean();
      const canTouch = task.createdBy === req.session.userId || Boolean(isAssigned);
      if (!canTouch) return res.status(403).json({ message: 'Employees can delete only their own/assigned tasks' });
    }

    // Cascade-delete subtasks so the UI doesn't end up with orphaned children
    // whose parent_task_id points at a now-missing row.
    const subtaskDocs = await Task.find({ parentTaskId: taskId }).select('_id').lean();
    const subtaskIds = subtaskDocs.map((doc) => doc._id);
    const allIds = [taskId, ...subtaskIds];

    await TaskAssignee.deleteMany({ taskId: { $in: allIds } });
    await TaskComment.deleteMany({ taskId: { $in: allIds } });
    await Notification.deleteMany({ taskId: { $in: allIds } });
    await Task.deleteMany({ _id: { $in: allIds } });

    rt.broadcast('task:deleted', { task_id: taskId, list_id: task.listId });
    for (const childId of subtaskIds) {
      rt.broadcast('task:deleted', { task_id: childId, list_id: task.listId });
    }
    res.json({ ok: true, deleted_subtask_ids: subtaskIds });
  });

  router.get('/tasks/:taskId', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const currentUser = await User.findById(req.session.userId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });
    if (!canViewWorkspaceByDepartment(currentUser?.department ?? null, workspace?.department ?? null, role)) {
      return res.status(403).json({ message: 'Department access blocked' });
    }
    if (
      !canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    ) {
      return res.status(403).json({ message: 'Space department access blocked' });
    }

    const assignees = await TaskAssignee.find({ taskId }).lean();

    res.json({
      task: taskToDTO(task, assignees.map((a) => a.userId)),
      context: {
        workspace_id: space.workspaceId,
        space_id: space._id,
        list_id: list._id,
      },
    });
  });

  router.get('/tasks/:taskId/comments', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });

    const comments = await TaskComment.find({ taskId }).sort({ createdAt: 1 }).lean();
    const authorIds = comments.map((c) => c.userId);
    const readerIds = comments.flatMap((c) => (c.readBy || []).map((r) => r.userId));
    const reactorIds = comments.flatMap((c) => (c.reactions || []).map((r) => r.userId));
    const userIds = [...new Set([...authorIds, ...readerIds, ...reactorIds])];
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = Object.fromEntries(
      users.map((u) => [u._id, u.displayName || u.email || 'Unknown user'])
    );

    const serializedComments = comments.map((comment) => serializeComment(comment, userMap));

    res.json({
      comments: serializedComments.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    });
  });

  router.post('/tasks/:taskId/comments', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const { content, attachments, parentCommentId } = req.body ?? {};
    const text = String(content || '').trim();
    const attachmentList = Array.isArray(attachments)
      ? attachments.map((attachment) => ({
          filename: String(attachment.filename || ''),
          mimeType: String(attachment.mimeType || ''),
          dataUrl: String(attachment.dataUrl || ''),
        }))
      : [];

    if (!text && attachmentList.length === 0) {
      return res.status(400).json({ message: 'Comment content or attachment required' });
    }

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canUpdateTask(role)) return res.status(403).json({ message: 'No permission' });

    // Validate the parent reference — it must be an existing comment on the SAME task,
    // and we flatten nested threads (reply-to-a-reply points to the original parent).
    let normalizedParentId = null;
    if (parentCommentId) {
      const parent = await TaskComment.findOne({ _id: String(parentCommentId), taskId }).lean();
      if (!parent) {
        return res.status(400).json({ message: 'Parent comment not found' });
      }
      normalizedParentId = parent.parentCommentId ?? parent._id;
    }

    const comment = await TaskComment.create({
      _id: randomUUID(),
      taskId,
      userId: req.session.userId,
      content: text,
      attachments: attachmentList,
      parentCommentId: normalizedParentId,
    });

    const author = await User.findById(req.session.userId).lean();
    const userMap = author
      ? { [author._id]: author.displayName || author.email || 'Unknown user' }
      : {};

    const dto = serializeComment(comment.toObject(), userMap);
    if (!task.isBeingCreated) {
      const actorName = author?.displayName || author?.email || 'Someone';
      const taskAssignees = await TaskAssignee.find({ taskId }).lean();
      const recipients = [...new Set(taskAssignees.map((a) => a.userId).filter(Boolean))].filter(
        (id) => id !== req.session.userId
      );
      if (recipients.length > 0) {
        await createNotifications({
          userIds: recipients,
          workspaceId: space.workspaceId,
          taskId,
          type: 'task_status_changed',
          message: `${actorName} commented on task ${task.title}`,
          realtime: rt,
        });
      }
    }
    rt.broadcast('comment:created', { task_id: taskId, comment: dto });
    res.json({ comment: dto });
  });

  /**
   * Toggle an emoji reaction for the current user on a comment.
   * Body: { emoji: string }
   * - If the user already reacted with this exact emoji → remove it.
   * - Otherwise → add it.
   * Returns the refreshed comment DTO.
   */
  router.post('/tasks/:taskId/comments/:commentId/reactions', requireAuth, async (req, res) => {
    const { taskId, commentId } = req.params;
    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) return res.status(400).json({ message: 'emoji required' });
    // Keep to a short symbol so we can't be abused with multi-KB payloads.
    if (emoji.length > 8) return res.status(400).json({ message: 'emoji too long' });

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });

    const doc = await TaskComment.findOne({ _id: commentId, taskId });
    if (!doc) return res.status(404).json({ message: 'Comment not found' });

    const viewerId = req.session.userId;
    const existingIdx = (doc.reactions || []).findIndex(
      (r) => r.userId === viewerId && r.emoji === emoji,
    );
    if (existingIdx >= 0) {
      doc.reactions.splice(existingIdx, 1);
    } else {
      doc.reactions.push({ emoji, userId: viewerId, createdAt: new Date() });
    }
    await doc.save();

    const reactorIds = (doc.reactions || []).map((r) => r.userId);
    const userIds = [...new Set([doc.userId, ...reactorIds])];
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = Object.fromEntries(
      users.map((u) => [u._id, u.displayName || u.email || 'Unknown user']),
    );
    const dto = serializeComment(doc.toObject(), userMap);
    rt.broadcast('comment:updated', { task_id: taskId, comment: dto });
    res.json({ comment: dto });
  });

  router.patch('/tasks/:taskId/comments/:commentId', requireAuth, async (req, res) => {
    const { taskId, commentId } = req.params;
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ message: 'content required' });

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canUpdateTask(role)) return res.status(403).json({ message: 'No permission' });

    const comment = await TaskComment.findOne({ _id: commentId, taskId });
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (comment.userId !== req.session.userId) {
      return res.status(403).json({ message: 'Only the author can edit this comment' });
    }

    comment.content = content;
    await comment.save();

    const participantIds = [
      comment.userId,
      ...(comment.readBy || []).map((r) => r.userId),
      ...(comment.reactions || []).map((r) => r.userId),
    ];
    const users = participantIds.length
      ? await User.find({ _id: { $in: [...new Set(participantIds)] } }).lean()
      : [];
    const userMap = Object.fromEntries(
      users.map((u) => [u._id, u.displayName || u.email || 'Unknown user'])
    );
    const dto = serializeComment(comment.toObject(), userMap);
    rt.broadcast('comment:updated', { task_id: taskId, comment: dto });
    res.json({ comment: dto });
  });

  router.delete('/tasks/:taskId/comments/:commentId', requireAuth, async (req, res) => {
    const { taskId, commentId } = req.params;

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });
    const role = await getRole(space.workspaceId, req.session.userId);
    if (!canUpdateTask(role)) return res.status(403).json({ message: 'No permission' });

    const comment = await TaskComment.findOne({ _id: commentId, taskId }).lean();
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (comment.userId !== req.session.userId) {
      return res.status(403).json({ message: 'Only the author can delete this comment' });
    }

    await TaskComment.deleteOne({ _id: commentId, taskId });
    await TaskComment.deleteMany({ taskId, parentCommentId: commentId });
    rt.broadcast('comment:deleted', { task_id: taskId, comment_id: commentId });
    res.json({ ok: true });
  });

  /** Record that the current user has seen these comments (read receipts). Skips the viewer's own messages. */
  router.post('/tasks/:taskId/comments/mark-read', requireAuth, async (req, res) => {
    const { taskId } = req.params;
    const rawIds = req.body?.commentIds;
    const commentIds = Array.isArray(rawIds) ? rawIds.map((id) => String(id)) : [];
    if (commentIds.length === 0) {
      return res.status(400).json({ message: 'commentIds required' });
    }

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const list = await List.findById(task.listId).lean();
    if (!list) return res.status(404).json({ message: 'List not found' });
    const space = await Space.findById(list.spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });

    const viewerId = req.session.userId;
    const now = new Date();

    for (const cid of commentIds) {
      const doc = await TaskComment.findOne({ _id: cid, taskId });
      if (!doc) continue;
      if (doc.userId === viewerId) continue;
      const readers = doc.readBy || [];
      if (readers.some((r) => r.userId === viewerId)) continue;
      readers.push({ userId: viewerId, readAt: now });
      doc.readBy = readers;
      await doc.save();
    }

    res.json({ ok: true });
  });

  /**
   * Space-level discussion channel.
   * Strictly department-scoped: admin OR user whose department matches
   * the space's department (or the space's own name, if it's the master
   * folder). Other users (cross-department) can't read or post.
   */
  async function canAccessSpaceDiscussion(space, userId) {
    if (!space) return false;
    const role = await getRole(space.workspaceId, userId);
    if (!role) return false;
    if (role === 'admin') return true;
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const user = await User.findById(userId).lean();
    const isMain = await isDepartmentMainSpace(space);
    return canAccessSpaceByDepartment({
      role,
      userDepartment: user?.department ?? null,
      workspaceDepartment: workspace?.department ?? null,
      spaceDepartment: space.department,
      spaceName: space.name,
      isDepartmentMain: isMain,
    });
  }

  /**
   * Aggregated tasks across every list in a space — powers the ClickUp-style
   * space-level Board view. Respects the same department access rules and
   * excludes lists the viewer can't see (e.g. private sub-lists outside their
   * own department, though shared main lists remain visible).
   */
  router.get('/spaces/:spaceId/tasks', requireAuth, async (req, res) => {
    const { spaceId } = req.params;
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const role = await getRole(space.workspaceId, req.session.userId);
    if (!role) return res.status(403).json({ message: 'No permission' });
    const currentUser = await User.findById(req.session.userId).lean();
    const workspace = await Workspace.findById(space.workspaceId).lean();
    const isDepartmentMain = await isDepartmentMainSpace(space);

    if (!canViewWorkspaceByDepartment(currentUser?.department ?? null, workspace?.department ?? null, role)) {
      return res.status(403).json({ message: 'Department access blocked' });
    }

    const allLists = await List.find({ spaceId }).lean();
    const visibleLists = allLists.filter((list) =>
      canAccessListForTasks({
        list,
        role,
        userId: req.session.userId,
        userDepartment: currentUser?.department ?? null,
        workspaceDepartment: workspace?.department ?? null,
        spaceDepartment: space.department,
        spaceName: space.name,
        isDepartmentMain,
      })
    );

    const tasks = await hydrateTasksForListIds(visibleLists.map((l) => l._id));
    res.json({
      tasks,
      lists: visibleLists.map((l) => ({ id: l._id, name: l.name })),
    });
  });

  router.get('/spaces/:spaceId/discussion', requireAuth, async (req, res) => {
    const { spaceId } = req.params;
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const allowed = await canAccessSpaceDiscussion(space, req.session.userId);
    if (!allowed) return res.status(403).json({ message: 'No permission to view this discussion' });

    const messages = await SpaceDiscussionMessage.find({ spaceId })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
    const userIds = [...new Set(messages.map((m) => m.userId))];
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = Object.fromEntries(
      users.map((u) => [u._id, u.displayName || u.email || 'Unknown user'])
    );

    res.json({
      messages: messages.map((m) => ({
        id: m._id,
        space_id: m.spaceId,
        user_id: m.userId,
        content: m.content,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        created_at: m.createdAt.toISOString(),
        author_name: userMap[m.userId] ?? 'Unknown user',
      })),
    });
  });

  router.post('/spaces/:spaceId/discussion', requireAuth, async (req, res) => {
    const { spaceId } = req.params;
    const text = String(req.body?.content || '').trim();
    const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (!text && rawAttachments.length === 0) {
      return res.status(400).json({ message: 'Message content or attachment required' });
    }
    if (text.length > 4000) return res.status(400).json({ message: 'Message too long' });
    if (rawAttachments.length > 10) {
      return res.status(400).json({ message: 'Too many attachments (max 10)' });
    }

    const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
    const attachments = [];
    for (const att of rawAttachments) {
      const filename = String(att?.filename || '').trim();
      const mimeType = String(att?.mimeType || 'application/octet-stream');
      const dataUrl = String(att?.dataUrl || '');
      if (!filename || !dataUrl.startsWith('data:')) {
        return res.status(400).json({ message: 'Invalid attachment payload' });
      }
      // Rough size check based on base64 length.
      const base64 = dataUrl.split(',')[1] || '';
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({ message: `Attachment "${filename}" exceeds 4 MB` });
      }
      attachments.push({ filename, mimeType, dataUrl });
    }

    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const allowed = await canAccessSpaceDiscussion(space, req.session.userId);
    if (!allowed) return res.status(403).json({ message: 'No permission to post in this discussion' });

    const message = await SpaceDiscussionMessage.create({
      _id: randomUUID(),
      spaceId,
      userId: req.session.userId,
      content: text,
      attachments,
    });

    const author = await User.findById(req.session.userId).lean();
    const messageDto = {
      id: message._id,
      space_id: message.spaceId,
      user_id: message.userId,
      content: message.content,
      attachments: message.attachments || [],
      created_at: message.createdAt.toISOString(),
      author_name: author?.displayName || author?.email || 'Unknown user',
    };
    rt.broadcast('discussion:message', { space_id: spaceId, message: messageDto });
    res.json({ message: messageDto });
  });

  router.delete('/spaces/:spaceId/discussion/:messageId', requireAuth, async (req, res) => {
    const { spaceId, messageId } = req.params;
    const space = await Space.findById(spaceId).lean();
    if (!space) return res.status(404).json({ message: 'Space not found' });

    const allowed = await canAccessSpaceDiscussion(space, req.session.userId);
    if (!allowed) return res.status(403).json({ message: 'No permission for this discussion' });

    const message = await SpaceDiscussionMessage.findById(messageId).lean();
    if (!message || message.spaceId !== spaceId) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const role = await getRole(space.workspaceId, req.session.userId);
    const isOwner = message.userId === req.session.userId;
    const isAdmin = role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only the author or an admin can delete this message' });
    }

    await SpaceDiscussionMessage.deleteOne({ _id: messageId });
    rt.broadcast('discussion:message-deleted', { space_id: spaceId, message_id: messageId });
    res.json({ ok: true });
  });

  // ---------------- Reminders ----------------

  function serializeReminder(r) {
    return {
      id: r._id,
      workspaceId: r.workspaceId,
      title: r.title,
      description: r.description || '',
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      status: r.status,
      createdBy: r.createdBy,
      notifyUserIds: Array.isArray(r.notifyUserIds) ? r.notifyUserIds : [],
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      preDayNotifiedAt: r.preDayNotifiedAt ? new Date(r.preDayNotifiedAt).toISOString() : null,
      dueDayNotifiedAt: r.dueDayNotifiedAt ? new Date(r.dueDayNotifiedAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    };
  }

  router.get('/reminders', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const reminders = await Reminder.find({
      $or: [{ createdBy: userId }, { notifyUserIds: userId }],
    })
      .sort({ dueDate: 1 })
      .limit(500)
      .lean();
    res.json({ reminders: reminders.map(serializeReminder) });
  });

  router.post('/reminders', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const { workspaceId, title, description, dueDate, notifyUserIds, attachments } = req.body ?? {};

    const safeTitle = String(title || '').trim();
    if (!safeTitle) return res.status(400).json({ message: 'Reminder title is required' });
    if (safeTitle.length > 300) {
      return res.status(400).json({ message: 'Reminder title is too long' });
    }

    if (!workspaceId) return res.status(400).json({ message: 'workspaceId is required' });
    const role = await getRole(String(workspaceId), userId);
    if (!role) return res.status(403).json({ message: 'No permission for this workspace' });

    const parsedDue = dueDate ? new Date(dueDate) : null;
    if (!parsedDue || Number.isNaN(parsedDue.getTime())) {
      return res.status(400).json({ message: 'A valid dueDate is required' });
    }

    // Sanitize notifyUserIds: unique strings, always include creator unless explicitly excluded.
    const rawTargets = Array.isArray(notifyUserIds) ? notifyUserIds : [];
    const targetSet = new Set(
      rawTargets
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
    );
    targetSet.add(userId);

    // Validate targets are members of this workspace.
    const memberIds = new Set(
      (await WorkspaceMember.find({ workspaceId, userId: { $in: Array.from(targetSet) } }).lean()).map(
        (m) => m.userId
      )
    );
    const notifyUserIdsClean = Array.from(targetSet).filter((id) => memberIds.has(id));
    if (notifyUserIdsClean.length === 0) notifyUserIdsClean.push(userId);

    // Validate + normalize attachments (same contract as comment / discussion attachments).
    const rawAttachments = Array.isArray(attachments) ? attachments : [];
    if (rawAttachments.length > 10) {
      return res.status(400).json({ message: 'Too many attachments (max 10)' });
    }
    const MAX_REMINDER_ATTACHMENT_BYTES = 4 * 1024 * 1024;
    const cleanAttachments = [];
    for (const att of rawAttachments) {
      const filename = String(att?.filename || '').trim();
      const mimeType = String(att?.mimeType || 'application/octet-stream');
      const dataUrl = String(att?.dataUrl || '');
      if (!filename || !dataUrl.startsWith('data:')) {
        return res.status(400).json({ message: 'Invalid attachment payload' });
      }
      const base64 = dataUrl.split(',')[1] || '';
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > MAX_REMINDER_ATTACHMENT_BYTES) {
        return res.status(400).json({ message: `Attachment "${filename}" exceeds 4 MB` });
      }
      cleanAttachments.push({ filename, mimeType, dataUrl });
    }

    const reminder = await Reminder.create({
      _id: randomUUID(),
      workspaceId: String(workspaceId),
      createdBy: userId,
      notifyUserIds: notifyUserIdsClean,
      title: safeTitle,
      description: typeof description === 'string' ? description.slice(0, 2000) : '',
      dueDate: parsedDue,
      status: 'pending',
      attachments: cleanAttachments,
    });

    res.json({ reminder: serializeReminder(reminder.toObject()) });
  });

  router.patch('/reminders/:id', requireAuth, async (req, res) => {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ message: 'Reminder not found' });
    if (reminder.createdBy !== req.session.userId) {
      return res.status(403).json({ message: 'Only the creator can update this reminder' });
    }

    const { title, description, dueDate, status, notifyUserIds } = req.body ?? {};
    if (typeof title === 'string') {
      const safeTitle = title.trim();
      if (!safeTitle) return res.status(400).json({ message: 'Title cannot be empty' });
      reminder.title = safeTitle.slice(0, 300);
    }
    if (typeof description === 'string') {
      reminder.description = description.slice(0, 2000);
    }
    if (dueDate !== undefined) {
      const parsedDue = new Date(dueDate);
      if (Number.isNaN(parsedDue.getTime())) {
        return res.status(400).json({ message: 'Invalid dueDate' });
      }
      reminder.dueDate = parsedDue;
      // New due date -> re-arm notifications.
      reminder.preDayNotifiedAt = null;
      reminder.dueDayNotifiedAt = null;
    }
    if (typeof status === 'string' && ['pending', 'done', 'cancelled'].includes(status)) {
      reminder.status = status;
    }
    if (Array.isArray(notifyUserIds)) {
      const targetSet = new Set(
        notifyUserIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      );
      targetSet.add(reminder.createdBy);
      const memberIds = new Set(
        (
          await WorkspaceMember.find({
            workspaceId: reminder.workspaceId,
            userId: { $in: Array.from(targetSet) },
          }).lean()
        ).map((m) => m.userId)
      );
      const clean = Array.from(targetSet).filter((id) => memberIds.has(id));
      reminder.notifyUserIds = clean.length > 0 ? clean : [reminder.createdBy];
    }

    await reminder.save();
    res.json({ reminder: serializeReminder(reminder.toObject()) });
  });

  router.delete('/reminders/:id', requireAuth, async (req, res) => {
    const reminder = await Reminder.findById(req.params.id).lean();
    if (!reminder) return res.status(404).json({ message: 'Reminder not found' });
    if (reminder.createdBy !== req.session.userId) {
      return res.status(403).json({ message: 'Only the creator can delete this reminder' });
    }
    await Reminder.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  });

  return router;
}
