import { Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface TeamMember {
  id: string;
  label: string;
  role: 'admin' | 'manager' | 'team_lead' | 'employee' | 'guest';
}

interface TeamMembersPageProps {
  members: TeamMember[];
  canManageWorkspace: boolean;
  onUpdateMemberRole: (memberId: string, role: 'employee' | 'team_lead' | 'manager' | 'admin') => void;
}

export function TeamMembersPage({ members, canManageWorkspace, onUpdateMemberRole }: TeamMembersPageProps) {
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
                    {canManageWorkspace ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          onUpdateMemberRole(member.id, e.target.value as 'employee' | 'team_lead' | 'manager' | 'admin')
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                      >
                        <option value="employee">Employee</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {member.role === 'team_lead' ? 'team lead' : member.role}
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
