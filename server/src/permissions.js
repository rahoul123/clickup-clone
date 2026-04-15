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
  return resolved === 'admin' || resolved === 'manager' || resolved === 'team_lead';
}

export function canManageStructure(role) {
  const resolved = normalizeRole(role);
  return resolved === 'admin' || resolved === 'manager' || resolved === 'team_lead';
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
  return resolved === 'admin' || resolved === 'manager';
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
  if (!workspaceDepartment) return true;
  if (resolved === 'admin') return true;
  return userDepartment === workspaceDepartment;
}
