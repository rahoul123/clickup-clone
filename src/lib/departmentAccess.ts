import type { AppRole } from '@/types';
import type { Space, Workspace } from '@/types';

/** Mirrors server `normalizeDepartment` in routes.js */
export function normalizeDepartment(input: string | null | undefined): string {
  return String(input || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Same rules as server `canAccessSpaceByDepartment` — which spaces a non-admin may see
 * for tasks / export (manager, team_lead, employee scoped by department).
 */
export function canAccessSpaceForRole(
  role: AppRole,
  userDepartment: string | null | undefined,
  workspace: Pick<Workspace, 'department'> | null | undefined,
  space: Pick<Space, 'department' | 'name'>
): boolean {
  if (role === 'admin') return true;
  const userNorm = normalizeDepartment(userDepartment);
  if (!userNorm) return false;

  const explicitSpaceNorm = normalizeDepartment(space.department ?? null);
  if (explicitSpaceNorm) return explicitSpaceNorm === userNorm;

  const workspaceNorm = normalizeDepartment(workspace?.department ?? null);
  if (workspaceNorm && workspaceNorm !== userNorm) return false;

  const spaceNameNorm = normalizeDepartment(space.name);
  if (!spaceNameNorm) return false;
  return spaceNameNorm.includes(userNorm) || userNorm.includes(spaceNameNorm);
}

/** Admin: full workspace export. Manager / TL: only spaces allowed by department rules. */
export function filterSpacesForExport(
  role: AppRole,
  userDepartment: string | null | undefined,
  workspace: Workspace | null,
  spaces: Space[]
): Space[] {
  if (!workspace) return [];
  if (role === 'admin') return spaces;
  return spaces.filter((s) => canAccessSpaceForRole(role, userDepartment, workspace, s));
}
