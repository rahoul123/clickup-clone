import { useEffect, useState } from 'react';
import {
  Home,
  Bell,
  FileText,
  BarChart3,
  Timer,
  Plus,
  ChevronRight,
  ChevronDown,
  Hash,
  Settings,
  Users,
  LogOut,
  Trash2,
  X,
  Folder,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarItem {
  id: string;
  name: string;
  icon?: React.ReactNode;
  workspaceId?: string;
  children?: SidebarItem[];
  /** If provided, clicking this space opens board using this list id. */
  openListId?: string;
  /** Render as space that should not expand children in sidebar. */
  noExpand?: boolean;
  type: 'space' | 'list' | 'nav';
  color?: string;
  /** Master "Team Space" folder — + creates a department space, not a list */
  isMasterFolder?: boolean;
}

const navItems = [
  { id: 'home', name: 'Home', icon: <Home className="w-4 h-4" />, type: 'nav' as const },
  { id: 'notifications', name: 'Notifications', icon: <Bell className="w-4 h-4" />, type: 'nav' as const },
  { id: 'docs', name: 'Docs', icon: <FileText className="w-4 h-4" />, type: 'nav' as const },
  { id: 'dashboards', name: 'Dashboards', icon: <BarChart3 className="w-4 h-4" />, type: 'nav' as const },
  { id: 'timesheets', name: 'Timesheets', icon: <Timer className="w-4 h-4" />, type: 'nav' as const },
  { id: 'team-members', name: 'Team Members', icon: <Users className="w-4 h-4" />, type: 'nav' as const },
];

interface AppSidebarProps {
  activeList: string | null;
  onSelectList: (listId: string) => void;
  workspaceName: string;
  /** Grouped by workspace — all team spaces the user can access */
  workspaceSections: Array<{
    id: string;
    name: string;
    spaces: Array<{
      id: string;
      name: string;
      color?: string;
      isMasterFolder?: boolean;
      lists?: Array<{ id: string; name: string }>;
      children?: Array<{
        id: string;
        name: string;
        color?: string;
        noExpand?: boolean;
        lists: Array<{ id: string; name: string }>;
      }>;
    }>;
  }>;
  activeWorkspaceId?: string | null;
  activeNav?: 'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets';
  onNavigate?: (view: 'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets') => void;
  onCreateWorkspace: (name: string) => Promise<void> | void;
  onCreateSpace: (name: string) => Promise<void> | void;
  onCreateList: (spaceId: string, name: string) => Promise<void> | void;
  onDeleteSpace: (spaceId: string, spaceName: string) => Promise<void> | void;
  onDeleteList: (listId: string, listName: string) => Promise<void> | void;
  onInvite: (email: string, role: 'employee' | 'team_lead' | 'manager' | 'admin', department: string) => Promise<void> | void;
  canManageWorkspace: boolean;
  canInviteMembers: boolean;
  canCreateSpaces: boolean;
  /** Admin-only: kanban columns / board structure controls. */
  canManageStructure: boolean;
  /** Admin / Manager / Team Lead: create & delete lists (folders) in sidebar. */
  canManageLists: boolean;
  canDeleteSpaces: boolean;
  notificationCount?: number;
  onLogout: () => Promise<void> | void;
  /** Open export dialog for a workspace (sidebar Team Space ⋯ menu) */
  onExportReport?: (workspaceId: string) => void;
  /** Admin / Manager / Team lead only — per workspace role */
  canExportReport?: (workspaceId: string) => boolean;
}

export function AppSidebar({
  activeList,
  onSelectList,
  workspaceName,
  workspaceSections,
  activeWorkspaceId = null,
  activeNav = 'board',
  onNavigate,
  onCreateWorkspace,
  onCreateSpace,
  onCreateList,
  onDeleteSpace,
  onDeleteList,
  onInvite,
  canManageWorkspace,
  canInviteMembers,
  canCreateSpaces,
  canManageStructure,
  canManageLists,
  canDeleteSpaces,
  notificationCount = 0,
  onLogout,
  onExportReport,
  canExportReport,
}: AppSidebarProps) {
  const allSpaceIds = workspaceSections.flatMap((s) =>
    s.spaces.flatMap((sp) => {
      if (sp.isMasterFolder) {
        return [sp.id, ...(sp.children ?? []).map((c) => c.id)];
      }
      return [sp.id];
    })
  );
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set(allSpaceIds));
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'employee' | 'team_lead' | 'manager' | 'admin'>('employee');
  const [inviteDepartment, setInviteDepartment] = useState('');
  const activeWorkspaceSection = workspaceSections.find((s) => s.id === activeWorkspaceId) ?? workspaceSections[0];
  const inviteDepartmentOptions = (activeWorkspaceSection?.spaces || [])
    .flatMap((space) => (space.isMasterFolder ? space.children ?? [] : []))
    .map((child) => child.name.trim())
    .filter(Boolean)
    .filter((name, idx, arr) => arr.findIndex((x) => x.toLowerCase() === name.toLowerCase()) === idx);

  useEffect(() => {
    setExpandedItems(new Set(workspaceSections.flatMap((s) => s.spaces.map((sp) => sp.id))));
  }, [workspaceSections]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = (item: SidebarItem, depth = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = !item.noExpand && item.children && item.children.length > 0;
    const isActive = item.id === activeList;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) toggleExpand(item.id);
            if (item.type === 'list') {
              onNavigate?.('board');
              onSelectList(item.id);
            }
            if (item.type === 'space' && item.openListId) {
              onNavigate?.('board');
              onSelectList(item.openListId);
            }
          }}
          className={cn(
            'group flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-all',
            'hover:bg-sidebar-accent/80 hover:shadow-sm',
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
            !isActive && 'text-sidebar-foreground'
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren && (
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          )}
          {!hasChildren && <span className="w-4" />}

          {item.type === 'space' && item.isMasterFolder && (
            <Folder className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden />
          )}
          {item.type === 'space' && !item.isMasterFolder && (
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground flex-shrink-0"
              style={{ backgroundColor: item.color || 'hsl(var(--sidebar-primary))' }}
            >
              {item.name[0]}
            </span>
          )}
          {item.type === 'list' && <Hash className="w-4 h-4 flex-shrink-0 text-sidebar-muted" />}

          <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>

          {item.type === 'space' && item.isMasterFolder && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md p-1 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    aria-label="Team space options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    disabled={!item.workspaceId || !canExportReport?.(item.workspaceId)}
                    onSelect={() => {
                      if (!item.workspaceId || !canExportReport?.(item.workspaceId)) return;
                      onExportReport?.(item.workspaceId);
                    }}
                  >
                    Export report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                disabled={!canCreateSpaces}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canCreateSpaces) return;
                  const spaceName = window.prompt('Department / team space name');
                  if (spaceName?.trim()) onCreateSpace(spaceName.trim());
                }}
                className="text-sidebar-muted hover:text-sidebar-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                title="Add department space"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {item.type === 'space' && !item.isMasterFolder && !item.noExpand && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                disabled={!canManageLists}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canManageLists) return;
                  const listName = window.prompt('List name');
                  if (listName?.trim()) onCreateList(item.id, listName.trim());
                }}
                className="text-sidebar-muted hover:text-sidebar-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                title="Add list"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canDeleteSpaces}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canDeleteSpaces) return;
                  onDeleteSpace(item.id, item.name);
                }}
                className="text-sidebar-muted hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                title="Delete space"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {item.type === 'list' && (
            <button
              type="button"
              disabled={!canManageLists}
              onClick={(e) => {
                e.stopPropagation();
                if (!canManageLists) return;
                onDeleteList(item.id, item.name);
              }}
              className="text-sidebar-muted opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              title="Delete list"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </button>

        {hasChildren && isExpanded && (
          <div>{item.children!.map((child) => renderItem(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <>
    <aside className="relative flex h-full min-h-0 w-64 shrink-0 flex-col overflow-x-hidden border-r border-sidebar-border/60 bg-sidebar/95 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--sidebar-primary)/0.25),transparent_45%),radial-gradient(circle_at_bottom_right,hsl(var(--sidebar-accent)/0.18),transparent_55%)]" />
      <div className="flex h-full min-h-0 flex-col">
      {/* Workspace header */}
      <div className="relative border-b border-sidebar-border/70 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            {workspaceName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[13px] font-semibold text-sidebar-accent-foreground">{workspaceName}</p>
            <p className="text-[11px] text-sidebar-muted">Team Workspace</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            disabled={!canManageWorkspace}
            onClick={() => {
              if (!canManageWorkspace) return;
              const nextName = window.prompt('Workspace name');
              if (nextName?.trim()) onCreateWorkspace(nextName.trim());
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-[11px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Settings className="w-3 h-3" /> Settings
          </button>
          <button
            disabled={!canInviteMembers}
            onClick={() => {
              if (!canInviteMembers) return;
              setInviteEmail('');
              setInviteRole('employee');
              setInviteDepartment(inviteDepartmentOptions[0] ?? '');
              setShowInviteModal(true);
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-[11px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Users className="w-3 h-3" /> Invite
          </button>
        </div>
      </div>

      {/* Nav items */}
      <div className="relative space-y-0.5 px-2 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === 'home') onNavigate?.('home');
              if (item.id === 'dashboards') onNavigate?.('dashboard');
              if (item.id === 'notifications') onNavigate?.('notifications');
              if (item.id === 'team-members') onNavigate?.('team-members');
              if (item.id === 'docs') onNavigate?.('docs');
              if (item.id === 'timesheets') onNavigate?.('timesheets');
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
              (item.id === 'home' && activeNav === 'home') ||
                (item.id === 'dashboards' && activeNav === 'dashboard') ||
                (item.id === 'notifications' && activeNav === 'notifications') ||
                (item.id === 'team-members' && activeNav === 'team-members') ||
                (item.id === 'docs' && activeNav === 'docs') ||
                (item.id === 'timesheets' && activeNav === 'timesheets')
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/70'
            )}
          >
            {item.icon}
            <span>{item.name}</span>
            {item.id === 'notifications' && notificationCount > 0 && (
              <span className="ml-auto text-[10px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                {notificationCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Team spaces (per workspace) */}
      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:hsl(var(--sidebar-border))_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sidebar-border/70 hover:[&::-webkit-scrollbar-thumb]:bg-sidebar-border">
        {workspaceSections.map((section) => (
          <div key={section.id} className="mb-3 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 py-1.5">
            {section.spaces.map((space) => {
              if (space.isMasterFolder) {
                return renderItem({
                  id: space.id,
                  name: space.name,
                  workspaceId: section.id,
                  color: space.color,
                  type: 'space',
                  isMasterFolder: true,
                  children: (space.children ?? []).map((child) => ({
                    id: child.id,
                    name: child.name,
                    color: child.color,
                    openListId: child.lists[0]?.id,
                    noExpand: child.noExpand,
                    type: 'space' as const,
                    children: child.lists.map((list) => ({
                      id: list.id,
                      name: list.name,
                      type: 'list' as const,
                    })),
                  })),
                });
              }
              return renderItem({
                id: space.id,
                name: space.name,
                color: space.color,
                type: 'space',
                children: (space.lists ?? []).map((list) => ({
                  id: list.id,
                  name: list.name,
                  type: 'list' as const,
                })),
              });
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="relative border-t border-sidebar-border/70 p-2">
        <button
          onClick={() => onLogout()}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
      </div>
    </aside>
    {showInviteModal && (
      <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Invite Team Member</h3>
            <button type="button" onClick={() => setShowInviteModal(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="member@company.com"
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Department</label>
              <select
                value={inviteDepartment}
                onChange={(e) => setInviteDepartment(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {!inviteDepartmentOptions.length && <option value="">No department found</option>}
                {inviteDepartmentOptions.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'employee' | 'team_lead' | 'manager' | 'admin')}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="employee">Employee</option>
                <option value="team_lead">Team Lead</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={() => setShowInviteModal(false)} className="h-9 px-3 rounded-md border border-input text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const email = inviteEmail.trim();
                const department = inviteDepartment.trim();
                if (!email || !department) return;
                onInvite(email, inviteRole, department);
                setShowInviteModal(false);
              }}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Send Invite
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
