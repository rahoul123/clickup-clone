import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { connectMongo } from '../src/db.js';
import {
  List,
  Space,
  Task,
  TaskAssignee,
  TaskComment,
  User,
  UserRole,
  Workspace,
  WorkspaceMember,
} from '../src/models.js';

dotenv.config({ path: '../.env' });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw error;
  return data ?? [];
}

async function upsertMany(model, docs, label) {
  if (!docs.length) return;
  for (const doc of docs) {
    const { _id, ...rest } = doc;
    await model.updateOne({ _id }, { $set: rest }, { upsert: true });
  }
  console.log(`Upserted ${docs.length} ${label}`);
}

async function main() {
  await connectMongo();

  const [profiles, workspaces, workspaceMembers, userRoles, spaces, lists, tasks, taskAssignees, taskComments] =
    await Promise.all([
      fetchAll('profiles', 'user_id, email, display_name, avatar_url, created_at, updated_at'),
      fetchAll('workspaces', 'id, name, slug, logo_url, created_by, created_at, updated_at'),
      fetchAll('workspace_members', 'workspace_id, user_id, invited_by, joined_at'),
      fetchAll('user_roles', 'workspace_id, user_id, role'),
      fetchAll('spaces', 'id, workspace_id, name, color, is_private, created_by, created_at, updated_at'),
      fetchAll('lists', 'id, space_id, folder_id, name, created_by, created_at, updated_at'),
      fetchAll('tasks', 'id, list_id, title, description, status, priority, start_date, due_date, created_by, created_at, updated_at'),
      fetchAll('task_assignees', 'task_id, user_id, assigned_at'),
      fetchAll('task_comments', 'id, task_id, user_id, content, created_at, updated_at'),
    ]);

  await upsertMany(
    User,
    profiles.map((row) => ({
      _id: row.user_id,
      email: row.email ?? `${row.user_id}@placeholder.local`,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      department: null,
      passwordHash: 'MIGRATED_SUPABASE_USER_SET_PASSWORD',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    'users'
  );

  await upsertMany(
    Workspace,
    workspaces.map((row) => ({
      _id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url,
      createdBy: row.created_by,
      department: 'general',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    'workspaces'
  );

  if (workspaceMembers.length) {
    await WorkspaceMember.deleteMany({});
    await WorkspaceMember.insertMany(
      workspaceMembers.map((row) => ({
        workspaceId: row.workspace_id,
        userId: row.user_id,
        invitedBy: row.invited_by,
        createdAt: row.joined_at,
        updatedAt: row.joined_at,
      }))
    );
  }

  if (userRoles.length) {
    await UserRole.deleteMany({});
    await UserRole.insertMany(
      userRoles.map((row) => ({
        workspaceId: row.workspace_id,
        userId: row.user_id,
        role: row.role === 'owner' ? 'admin' : row.role === 'member' ? 'employee' : row.role,
      }))
    );
  }

  await upsertMany(
    Space,
    spaces.map((row) => ({
      _id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      color: row.color,
      isPrivate: row.is_private,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    'spaces'
  );

  await upsertMany(
    List,
    lists.map((row) => ({
      _id: row.id,
      spaceId: row.space_id,
      folderId: row.folder_id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    'lists'
  );

  await upsertMany(
    Task,
    tasks.map((row) => ({
      _id: row.id,
      listId: row.list_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      startDate: row.start_date,
      dueDate: row.due_date,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    'tasks'
  );

  if (taskAssignees.length) {
    await TaskAssignee.deleteMany({});
    await TaskAssignee.insertMany(
      taskAssignees.map((row) => ({
        taskId: row.task_id,
        userId: row.user_id,
        createdAt: row.assigned_at,
        updatedAt: row.assigned_at,
      }))
    );
  }

  await upsertMany(
    TaskComment,
    taskComments.map((row) => ({
      _id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    'task comments'
  );

  const counts = await Promise.all([
    User.countDocuments(),
    Workspace.countDocuments(),
    Space.countDocuments(),
    List.countDocuments(),
    Task.countDocuments(),
  ]);
  console.log('Mongo counts:', {
    users: counts[0],
    workspaces: counts[1],
    spaces: counts[2],
    lists: counts[3],
    tasks: counts[4],
  });
}

main()
  .then(() => {
    console.log('Supabase to Mongo migration completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed', error);
    process.exit(1);
  });
