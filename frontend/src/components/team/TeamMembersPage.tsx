import { Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface TeamMember {
  id: string;
  label: string;
  role: 'super_admin' | 'admin' | 'manager' | 'team_lead' | 'employee' | 'guest';
  department?: string | null;
  is_deleted?: boolean;
}

interface TeamMembersPageProps {
  members: TeamMember[];
  canManageWorkspace: boolean;
  departments: string[];
  onUpdateMemberRole: (memberId: string, role: 'employee' | 'team_lead' | 'manager' | 'admin' | 'super_admin') => void;
  onUpdateMemberDepartment: (memberId: string, department: string) => void;
  onRemoveMember: (memberId: string) => void;
  onDeleteSuperAdmin: (memberId: string) => void;
  onRecoverSuperAdmin: (memberId: string) => void;
}

export function TeamMembersPage({
  members,
  canManageWorkspace,
  departments,
  onUpdateMemberRole,
  onUpdateMemberDepartment,
  onRemoveMember,
  onDeleteSuperAdmin,
  onRecoverSuperAdmin,
}: TeamMembersPageProps) {
  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Users className="h-3.5 w-3.5" />
              Team Members
            </div>
            <CardTitle className="text-xl">Manage Team Roles</CardTitle>
            <CardDescription>Update team member roles from here.</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No team members found.</div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{member.label}</p>
                    </div>
                    {canManageWorkspace && member.role !== 'super_admin' ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={member.department ?? ''}
                          onChange={(e) => onUpdateMemberDepartment(member.id, e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                        >
                          <option value="" disabled>
                            {member.department ? member.department : 'Set department'}
                          </option>
                          {departments.map((dep) => (
                            <option key={dep} value={dep}>
                              {dep}
                            </option>
                          ))}
                        </select>
                        <select
                          value={member.role}
                          onChange={(e) =>
                            onUpdateMemberRole(member.id, e.target.value as 'employee' | 'team_lead' | 'manager' | 'admin' | 'super_admin')
                          }
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                        >
                          <option value="super_admin">Super Admin</option>
                          {/* `employee` is the backend role key; the UI copy is "Team Member"
                             because "Employee" read oddly to staff ("we're all employees"). */}
                          <option value="employee">Team Member</option>
                          <option value="team_lead">Team Lead</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onRemoveMember(member.id)}
                          className="h-8 rounded-md border border-red-500/60 bg-red-100 px-2 text-xs font-semibold text-red-800 hover:bg-red-200 dark:border-red-400/70 dark:bg-red-500/20 dark:text-red-200 dark:hover:bg-red-500/30"
                        >
                          Remove
                        </button>
                      </div>
                    ) : member.role === 'super_admin' && canManageWorkspace ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                          {member.is_deleted ? 'super admin (deleted)' : 'super admin'}
                        </span>
                        {member.is_deleted ? (
                          <button
                            type="button"
                            onClick={() => onRecoverSuperAdmin(member.id)}
                            className="h-8 rounded-md border border-emerald-500/60 bg-emerald-100 px-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-200 dark:border-emerald-400/70 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/30"
                          >
                            Recover
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeleteSuperAdmin(member.id)}
                            className="h-8 rounded-md border border-red-500/60 bg-red-100 px-2 text-xs font-semibold text-red-800 hover:bg-red-200 dark:border-red-400/70 dark:bg-red-500/20 dark:text-red-200 dark:hover:bg-red-500/30"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {member.role === 'team_lead'
                          ? 'team lead'
                          : member.role === 'employee'
                            ? 'team member'
                            : member.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
