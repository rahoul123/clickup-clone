import { UserRole } from './models.js';

const ROLE_MAP = {
  owner: 'admin',
  member: 'employee',
};

function normalizeRole(role) {
  if (!role) return null;
  return ROLE_MAP[role] || role;
}

export async function getRole(workspaceId, userId) {
  const role = await UserRole.findOne({ workspaceId, userId }).lean();
  return normalizeRole(role?.role ?? null);
}

export function canManageWorkspace(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin';
}

export function canInviteMembers(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin';
}

export function canManageStructure(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin';
}

export function canCreateSpace(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin';
}

export function canCreateList(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin' || resolved === 'manager' || resolved === 'team_lead';
}

export function canDeleteSpace(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin';
}

export function canDeleteList(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin' || resolved === 'manager' || resolved === 'team_lead';
}

export function canCreateTasks(role) {
  const resolved = normalizeRole(role);
  return Boolean(resolved && resolved !== 'guest');
}

export function canUpdateTask(role) {
  const resolved = normalizeRole(role);
  return Boolean(resolved && resolved !== 'guest');
}

export function canViewWorkspaceByDepartment(userDepartment, workspaceDepartment, role) {
  const resolved = normalizeRole(role);
  if (!resolved || resolved === 'guest') return false;
  if (!workspaceDepartment) return true;
  if (resolved === 'admin') return true;
  const userNorm = String(userDepartment || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
  const workspaceNorm = String(workspaceDepartment || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
  // Team is now organized by department spaces inside a workspace.
  // Workspace-level blocking can hide the whole app for TL/Manager;
  // actual department isolation is enforced at space-level.
  if (userNorm === workspaceNorm) return true;
  return resolved === 'manager' || resolved === 'team_lead' || resolved === 'employee';
}
