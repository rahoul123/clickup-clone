import { useEffect, useMemo, useState } from 'react';
import {
  Home,
  Bell,
  FileText,
  BarChart3,
  Timer,
  Plus,
  ChevronRight,
  ChevronDown,
  ListChecks,
  MessageSquare,
  Settings,
  Users,
  LogOut,
  Trash2,
  X,
  Folder,
  MoreHorizontal,
  Lock,
  Check,
  Star,
  Pencil,
  Copy,
  Link as LinkIcon,
  Palette,
  Info,
  ArrowUp,
  ArrowDown,
  Archive,
  ArchiveRestore,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { toast } from 'sonner';

interface SidebarItem {
  id: string;
  name: string;
  icon?: React.ReactNode;
  workspaceId?: string;
  children?: SidebarItem[];
  /** If provided, clicking this space opens board using this list id. */
  openListId?: string;
  /** If true, clicking this space opens the unified Space View (Board + Discussion tabs). */
  spaceForView?: boolean;
  /** If set, clicking opens the space-level discussion channel. */
  discussionSpaceId?: string;
  /** Display name for the discussion panel header (department space name). */
  discussionSpaceName?: string;
  /** Render as space that should not expand children in sidebar. */
  noExpand?: boolean;
  type: 'space' | 'list' | 'nav' | 'discussion';
  color?: string;
  /** For `type: 'space'` — optional custom 1-4 char label shown inside the color avatar. */
  spaceIcon?: string | null;
  /** Master "Team Space" folder — + creates a department space, not a list */
  isMasterFolder?: boolean;
  /** For `type: 'list'` — when true, render a small lock icon to indicate restricted access. */
  isRestricted?: boolean;
  /** For `type: 'list'` — when true, viewer can't open this restricted list; render muted + block click. */
  accessLocked?: boolean;
  /** For `type: 'list'` — when true, viewer may open the "Edit access" modal (creator or admin). */
  canEditAccess?: boolean;
  /** For `type: 'list'` — current allow-list snapshot, used to pre-fill the edit modal. */
  allowedUserIds?: string[];
  /** For `type: 'list'` — per-user favorite flag; when true, show filled star. */
  isFavorited?: boolean;
  /** For `type: 'list'` — optional custom color applied to the list chip. */
  listColor?: string | null;
  /** For `type: 'list'` — creator user id (used for gating the edit modal). */
  listCreatedBy?: string | null;
  /** For `type: 'list'` — creation timestamp (for the info modal). */
  listCreatedAt?: string;
  /** For `type: 'list'` — description (for info modal). */
  listDescription?: string | null;
  /** For `type: 'list'` — parent space id, used for reorder payloads. */
  listSpaceId?: string;
  /** For `type: 'list'` — siblings (list ids within the same space, ordered) for move up/down. */
  listSiblingIds?: string[];
}

/** Shape the parent passes down for each list row (flattened for easier reuse). */
interface ListRowProps {
  id: string;
  name: string;
  isRestricted?: boolean;
  accessLocked?: boolean;
  canEditAccess?: boolean;
  allowedUserIds?: string[];
  isFavorited?: boolean;
  color?: string | null;
  icon?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  description?: string | null;
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
      /** Optional short label shown inside the space avatar (e.g. "W"). */
      spaceIcon?: string | null;
      isMasterFolder?: boolean;
      lists?: Array<ListRowProps>;
      children?: Array<{
        id: string;
        name: string;
        color?: string;
        spaceIcon?: string | null;
        noExpand?: boolean;
        /** If true, render a '# <name> Discussion' channel entry first under this department. */
        showDiscussion?: boolean;
        /** If true, clicking the space name opens the unified Space View. */
        spaceForView?: boolean;
        lists: Array<ListRowProps>;
      }>;
    }>;
  }>;
  activeWorkspaceId?: string | null;
  activeDiscussionSpaceId?: string | null;
  activeSpaceViewId?: string | null;
  onOpenDiscussion?: (spaceId: string, spaceName: string) => void;
  onOpenSpace?: (spaceId: string, spaceName: string) => void;
  activeNav?: 'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets' | 'discussion';
  onNavigate?: (view: 'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets') => void;
  onCreateWorkspace: (name: string) => Promise<void> | void;
  onCreateSpace: (name: string) => Promise<void> | void;
  onCreateList: (
    spaceId: string,
    name: string,
    access?: { isRestricted: boolean; allowedUserIds: string[] }
  ) => Promise<void> | void;
  /** Edit access on an existing list. Opens a modal gated by `canEditAccess` on the list. */
  onUpdateListAccess?: (
    listId: string,
    payload: { isRestricted: boolean; allowedUserIds: string[] }
  ) => Promise<void> | void;
  /** Rename / recolor / re-icon / re-describe an existing list. */
  onUpdateListDetails?: (
    listId: string,
    payload: {
      name?: string;
      color?: string | null;
      icon?: string | null;
      description?: string | null;
    }
  ) => Promise<void> | void;
  /** Duplicate a list in place — copies metadata and tasks. */
  onDuplicateList?: (listId: string) => Promise<void> | void;
  /** Reorder lists within a single space (full ordered id array). */
  onReorderLists?: (spaceId: string, orderedListIds: string[]) => Promise<void> | void;
  /** Archive a list (soft-delete / hide from sidebar). */
  onArchiveList?: (listId: string) => Promise<void> | void;
  /** Restore a previously archived list. */
  onUnarchiveList?: (listId: string) => Promise<void> | void;
  /** Toggle the viewer's favorite flag on a list. */
  onToggleFavoriteList?: (listId: string, nextFavorited: boolean) => Promise<void> | void;
  /** Fetch the archived list rows for a space (on-demand; drives the "Archived lists" modal). */
  onFetchArchivedLists?: (spaceId: string) => Promise<Array<{
    id: string;
    name: string;
    archived_at?: string | null;
    is_restricted?: boolean;
    created_at?: string;
  }>>;
  /** Workspace members used to populate the "who can access" picker when making a restricted list. */
  memberOptions?: Array<{ id: string; label: string }>;
  /** Current viewer — auto-included as an allowed user so the creator never locks themselves out. */
  currentUserId?: string | null;
  onDeleteSpace: (spaceId: string, spaceName: string) => Promise<void> | void;
  /** Rename / recolor / re-icon a department space. Only shown to structure managers. */
  onUpdateSpaceDetails?: (
    spaceId: string,
    payload: { name?: string; color?: string | null; icon?: string | null }
  ) => Promise<void> | void;
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
  activeDiscussionSpaceId = null,
  activeSpaceViewId = null,
  onOpenDiscussion,
  onOpenSpace,
  activeNav = 'board',
  onNavigate,
  onCreateWorkspace,
  onCreateSpace,
  onCreateList,
  onUpdateListAccess,
  onUpdateListDetails,
  onDuplicateList,
  onReorderLists,
  onArchiveList,
  onUnarchiveList,
  onToggleFavoriteList,
  onFetchArchivedLists,
  onDeleteSpace,
  onUpdateSpaceDetails,
  onDeleteList,
  onInvite,
  memberOptions = [],
  currentUserId = null,
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

  const [promptState, setPromptState] = useState<{
    title: string;
    label: string;
    placeholder?: string;
    submitText?: string;
    onSubmit: (value: string) => void | Promise<void>;
  } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  const openPrompt = (config: {
    title: string;
    label: string;
    placeholder?: string;
    submitText?: string;
    onSubmit: (value: string) => void | Promise<void>;
  }) => {
    setPromptValue('');
    setPromptState(config);
  };

  const closePrompt = () => {
    setPromptState(null);
    setPromptValue('');
  };

  const submitPrompt = async () => {
    if (!promptState) return;
    const value = promptValue.trim();
    if (!value) return;
    await promptState.onSubmit(value);
    closePrompt();
  };

  // "New List" modal with optional access restriction.
  const [newListState, setNewListState] = useState<{ spaceId: string } | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListRestricted, setNewListRestricted] = useState(false);
  const [newListAllowed, setNewListAllowed] = useState<Set<string>>(() => new Set());
  const [newListMemberQuery, setNewListMemberQuery] = useState('');

  const openNewListModal = (spaceId: string) => {
    setNewListName('');
    setNewListRestricted(false);
    setNewListAllowed(new Set());
    setNewListMemberQuery('');
    setNewListState({ spaceId });
  };

  const closeNewListModal = () => {
    setNewListState(null);
    setNewListName('');
    setNewListRestricted(false);
    setNewListAllowed(new Set());
    setNewListMemberQuery('');
  };

  const submitNewList = async () => {
    if (!newListState) return;
    const trimmed = newListName.trim();
    if (!trimmed) return;
    const access = newListRestricted
      ? {
          isRestricted: true,
          // Filter the creator out — server always treats them as allowed —
          // but keep them in the UI selection so toggling is idempotent.
          allowedUserIds: [...newListAllowed].filter((id) => id && id !== currentUserId),
        }
      : undefined;
    await onCreateList(newListState.spaceId, trimmed, access);
    closeNewListModal();
  };

  const toggleAllowedMember = (memberId: string) => {
    if (memberId && memberId === currentUserId) return;
    setNewListAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const filteredMemberOptions = useMemo(() => {
    const query = newListMemberQuery.trim().toLowerCase();
    if (!query) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(query));
  }, [memberOptions, newListMemberQuery]);

  // "Edit access" modal — updates an existing list's restriction / allow-list.
  // Mirrors the create-list access picker so the two experiences feel the
  // same. Only opens from rows where `canEditAccess` is true (creator/admin).
  const [editAccessState, setEditAccessState] = useState<{
    listId: string;
    listName: string;
  } | null>(null);
  const [editAccessRestricted, setEditAccessRestricted] = useState(false);
  const [editAccessAllowed, setEditAccessAllowed] = useState<Set<string>>(() => new Set());
  const [editAccessMemberQuery, setEditAccessMemberQuery] = useState('');
  const [editAccessSaving, setEditAccessSaving] = useState(false);

  const openEditAccessModal = (list: {
    id: string;
    name: string;
    isRestricted?: boolean;
    allowedUserIds?: string[];
  }) => {
    setEditAccessState({ listId: list.id, listName: list.name });
    setEditAccessRestricted(Boolean(list.isRestricted));
    setEditAccessAllowed(new Set(list.allowedUserIds ?? []));
    setEditAccessMemberQuery('');
  };

  const closeEditAccessModal = () => {
    setEditAccessState(null);
    setEditAccessRestricted(false);
    setEditAccessAllowed(new Set());
    setEditAccessMemberQuery('');
  };

  const toggleEditAccessMember = (memberId: string) => {
    if (memberId && memberId === currentUserId) return;
    setEditAccessAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const submitEditAccess = async () => {
    if (!editAccessState || !onUpdateListAccess) return;
    setEditAccessSaving(true);
    try {
      await onUpdateListAccess(editAccessState.listId, {
        isRestricted: editAccessRestricted,
        // Same rule as create: creator is implicit, server enforces admin
        // override. Filter self out so toggling the checkbox is a no-op.
        allowedUserIds: editAccessRestricted
          ? [...editAccessAllowed].filter((id) => id && id !== currentUserId)
          : [],
      });
      closeEditAccessModal();
    } finally {
      setEditAccessSaving(false);
    }
  };

  const filteredEditAccessMembers = useMemo(() => {
    const query = editAccessMemberQuery.trim().toLowerCase();
    if (!query) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(query));
  }, [memberOptions, editAccessMemberQuery]);

  // ---------- Rename / Color & Icon / Info / Archived modals ----------
  const [renameState, setRenameState] = useState<{ listId: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const openRenameModal = (list: { id: string; name: string }) => {
    setRenameState({ listId: list.id, name: list.name });
    setRenameValue(list.name);
  };
  const submitRename = async () => {
    if (!renameState || !onUpdateListDetails) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renameState.name) {
      setRenameState(null);
      return;
    }
    await onUpdateListDetails(renameState.listId, { name: trimmed });
    setRenameState(null);
  };

  const [appearanceState, setAppearanceState] = useState<{
    listId: string;
    name: string;
    color: string | null;
    icon: string | null;
  } | null>(null);

  const openAppearanceModal = (list: {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
  }) => {
    setAppearanceState({
      listId: list.id,
      name: list.name,
      color: list.color ?? null,
      icon: list.icon ?? null,
    });
  };
  const submitAppearance = async () => {
    if (!appearanceState || !onUpdateListDetails) return;
    await onUpdateListDetails(appearanceState.listId, {
      color: appearanceState.color,
      icon: appearanceState.icon,
    });
    setAppearanceState(null);
  };

  // ---------- Space rename / appearance (same pattern as list, separate state) ----------
  const [spaceRenameState, setSpaceRenameState] = useState<{ spaceId: string; name: string } | null>(null);
  const [spaceRenameValue, setSpaceRenameValue] = useState('');

  const openSpaceRenameModal = (space: { id: string; name: string }) => {
    setSpaceRenameState({ spaceId: space.id, name: space.name });
    setSpaceRenameValue(space.name);
  };
  const submitSpaceRename = async () => {
    if (!spaceRenameState || !onUpdateSpaceDetails) return;
    const trimmed = spaceRenameValue.trim();
    if (!trimmed || trimmed === spaceRenameState.name) {
      setSpaceRenameState(null);
      return;
    }
    await onUpdateSpaceDetails(spaceRenameState.spaceId, { name: trimmed });
    setSpaceRenameState(null);
  };

  const [spaceAppearanceState, setSpaceAppearanceState] = useState<{
    spaceId: string;
    name: string;
    color: string | null;
    icon: string | null;
  } | null>(null);

  const openSpaceAppearanceModal = (space: {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
  }) => {
    setSpaceAppearanceState({
      spaceId: space.id,
      name: space.name,
      color: space.color ?? null,
      icon: space.icon ?? null,
    });
  };
  const submitSpaceAppearance = async () => {
    if (!spaceAppearanceState || !onUpdateSpaceDetails) return;
    await onUpdateSpaceDetails(spaceAppearanceState.spaceId, {
      color: spaceAppearanceState.color,
      icon: spaceAppearanceState.icon,
    });
    setSpaceAppearanceState(null);
  };

  const [infoState, setInfoState] = useState<{
    listId: string;
    name: string;
    createdBy: string | null;
    createdAt?: string;
    description: string | null;
    isRestricted: boolean;
    allowedUserCount: number;
  } | null>(null);

  const [archivedState, setArchivedState] = useState<{
    spaceId: string;
    spaceName: string;
    loading: boolean;
    rows: Array<{ id: string; name: string; archived_at?: string | null; created_at?: string }>;
  } | null>(null);

  const openArchivedModal = async (spaceId: string, spaceName: string) => {
    if (!onFetchArchivedLists) return;
    setArchivedState({ spaceId, spaceName, loading: true, rows: [] });
    try {
      const rows = await onFetchArchivedLists(spaceId);
      setArchivedState({ spaceId, spaceName, loading: false, rows });
    } catch (err) {
      console.error('Failed to load archived lists', err);
      setArchivedState({ spaceId, spaceName, loading: false, rows: [] });
    }
  };

  const handleRestoreArchived = async (listId: string) => {
    if (!onUnarchiveList) return;
    await onUnarchiveList(listId);
    setArchivedState((prev) =>
      prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== listId) } : prev
    );
  };

  const copyListLink = async (listId: string) => {
    const link = `${window.location.origin}/?list=${listId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard can fail in non-secure contexts (e.g. Electron file://) —
      // fall back to a temporary textarea so the copy still lands.
      const textarea = document.createElement('textarea');
      textarea.value = link;
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  /** Compact palette of "safe" swatch colors for the list color picker. */
  const LIST_COLOR_SWATCHES: Array<{ value: string | null; label: string; sample: string }> = [
    { value: null, label: 'Default', sample: 'hsl(var(--sidebar-muted))' },
    { value: '#F97316', label: 'Orange', sample: '#F97316' },
    { value: '#F59E0B', label: 'Amber', sample: '#F59E0B' },
    { value: '#10B981', label: 'Emerald', sample: '#10B981' },
    { value: '#06B6D4', label: 'Cyan', sample: '#06B6D4' },
    { value: '#3B82F6', label: 'Blue', sample: '#3B82F6' },
    { value: '#6366F1', label: 'Indigo', sample: '#6366F1' },
    { value: '#8B5CF6', label: 'Violet', sample: '#8B5CF6' },
    { value: '#EC4899', label: 'Pink', sample: '#EC4899' },
    { value: '#EF4444', label: 'Red', sample: '#EF4444' },
  ];
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

  // Persistent favorite star + ⋯ context menu for list rows. Star is always
  // visible if favorited, and also appears on hover; the ⋯ trigger is
  // hover-only so inactive rows look clean.
  const renderListRowActions = (item: SidebarItem) => {
    if (item.type !== 'list') return null;
    // Employees / guests see only read-safe actions (Favorite, Copy link,
    // List info). Admin/Manager/TL see everything. A list's creator also
    // sees the edit-their-own-list actions (rename / appearance / archive)
    // so they can tidy up their own board.
    const isOwnList = Boolean(
      item.listCreatedBy && currentUserId && item.listCreatedBy === currentUserId
    );
    const canManageThisList = canManageLists || isOwnList;
    const canEditAppearance = canManageLists || isOwnList;
    const canDuplicate = Boolean(onDuplicateList) && canManageLists;
    const canMove = Boolean(onReorderLists) && canManageLists && (item.listSiblingIds?.length ?? 0) > 1;
    const canArchive = Boolean(onArchiveList) && canManageThisList;
    const canDelete = canManageLists;
    const siblings = item.listSiblingIds ?? [];
    const myIndex = siblings.indexOf(item.id);
    const canMoveUp = canMove && myIndex > 0;
    const canMoveDown = canMove && myIndex >= 0 && myIndex < siblings.length - 1;
    // "Admin-ish" section has any of these actions? If not, don't even
    // render the separators/group — keeps the menu visually tight for
    // employees who only see the top 3 items.
    const showAppearanceGroup =
      Boolean(onUpdateListDetails) && canEditAppearance;
    const showStructureGroup =
      canDuplicate || canMove || (item.canEditAccess && Boolean(onUpdateListAccess));
    const showDangerGroup = canArchive || canDelete;
    const moveWithin = (delta: -1 | 1) => {
      if (!onReorderLists || !item.listSpaceId || myIndex < 0) return;
      const nextIndex = myIndex + delta;
      if (nextIndex < 0 || nextIndex >= siblings.length) return;
      const next = siblings.slice();
      const [moved] = next.splice(myIndex, 1);
      next.splice(nextIndex, 0, moved);
      onReorderLists(item.listSpaceId, next);
    };

    return (
      <div className="flex items-center gap-0.5">
        {/* Favorite star — stays visible whenever the list is favorited so users
            can scan their pinned lists quickly; hover reveals it otherwise. */}
        {onToggleFavoriteList && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavoriteList(item.id, !item.isFavorited);
            }}
            className={cn(
              'rounded p-1 transition-colors',
              item.isFavorited
                ? 'text-amber-400 hover:text-amber-500'
                : 'text-sidebar-muted opacity-0 group-hover:opacity-100 hover:text-amber-500'
            )}
            title={item.isFavorited ? 'Unfavorite list' : 'Add to favorites'}
            aria-label={item.isFavorited ? 'Unfavorite list' : 'Favorite list'}
          >
            <Star
              className={cn('h-3.5 w-3.5', item.isFavorited && 'fill-current')}
            />
          </button>
        )}

        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="rounded p-1 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-label="List options"
                title="More actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onToggleFavoriteList && (
                <DropdownMenuItem
                  onSelect={() => onToggleFavoriteList(item.id, !item.isFavorited)}
                >
                  <Star
                    className={cn('h-3.5 w-3.5 mr-2', item.isFavorited && 'fill-current text-amber-500')}
                  />
                  {item.isFavorited ? 'Remove from favorites' : 'Favorite'}
                </DropdownMenuItem>
              )}
              {onUpdateListDetails && canEditAppearance && (
                <DropdownMenuItem
                  onSelect={() =>
                    openRenameModal({ id: item.id, name: item.name })
                  }
                >
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => copyListLink(item.id)}>
                <LinkIcon className="h-3.5 w-3.5 mr-2" /> Copy link
              </DropdownMenuItem>

              {showAppearanceGroup && <DropdownMenuSeparator />}

              {showAppearanceGroup && (
                <DropdownMenuItem
                  onSelect={() =>
                    openAppearanceModal({
                      id: item.id,
                      name: item.name,
                      color: item.listColor ?? null,
                    })
                  }
                >
                  <Palette className="h-3.5 w-3.5 mr-2" /> Color & icon
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() =>
                  setInfoState({
                    listId: item.id,
                    name: item.name,
                    createdBy: item.listCreatedBy ?? null,
                    createdAt: item.listCreatedAt,
                    description: item.listDescription ?? null,
                    isRestricted: Boolean(item.isRestricted),
                    allowedUserCount: (item.allowedUserIds ?? []).length,
                  })
                }
              >
                <Info className="h-3.5 w-3.5 mr-2" /> List info
              </DropdownMenuItem>

              {showStructureGroup && <DropdownMenuSeparator />}

              {canDuplicate && (
                <DropdownMenuItem onSelect={() => onDuplicateList?.(item.id)}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                </DropdownMenuItem>
              )}
              {canMove && (
                <>
                  <DropdownMenuItem
                    disabled={!canMoveUp}
                    onSelect={() => moveWithin(-1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5 mr-2" /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canMoveDown}
                    onSelect={() => moveWithin(1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5 mr-2" /> Move down
                  </DropdownMenuItem>
                </>
              )}
              {item.canEditAccess && onUpdateListAccess && (
                <DropdownMenuItem
                  onSelect={() =>
                    openEditAccessModal({
                      id: item.id,
                      name: item.name,
                      isRestricted: item.isRestricted,
                      allowedUserIds: item.allowedUserIds,
                    })
                  }
                >
                  <Share2 className="h-3.5 w-3.5 mr-2" />
                  Sharing &amp; Permissions
                </DropdownMenuItem>
              )}

              {showDangerGroup && <DropdownMenuSeparator />}

              {canArchive && (
                <DropdownMenuItem
                  onSelect={() => onArchiveList?.(item.id)}
                  className="text-amber-600 focus:bg-amber-500/10 focus:text-amber-700"
                >
                  <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onSelect={() => onDeleteList(item.id, item.name)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  const renderItem = (item: SidebarItem, depth = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = !item.noExpand && item.children && item.children.length > 0;
    const isActive =
      item.type === 'discussion'
        ? activeDiscussionSpaceId === item.discussionSpaceId
        : item.type === 'space' && item.spaceForView
          ? activeSpaceViewId === item.id
          : item.id === activeList;

    const isLockedList = item.type === 'list' && Boolean(item.accessLocked);

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (isLockedList) {
              window.alert(
                'This list is restricted. Please request access from the admin or list creator.'
              );
              return;
            }
            if (hasChildren) toggleExpand(item.id);
            if (item.type === 'list') {
              onNavigate?.('board');
              onSelectList(item.id);
            }
            if (item.type === 'space' && item.spaceForView) {
              onOpenSpace?.(item.id, item.name);
            } else if (item.type === 'space' && item.openListId) {
              onNavigate?.('board');
              onSelectList(item.openListId);
            }
            if (item.type === 'discussion' && item.discussionSpaceId) {
              onOpenDiscussion?.(item.discussionSpaceId, item.discussionSpaceName ?? item.name);
            }
          }}
          title={isLockedList ? 'Restricted — no access' : undefined}
          className={cn(
            'group flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-all',
            !isLockedList && 'hover:bg-sidebar-accent/80 hover:shadow-sm',
            isLockedList && 'cursor-not-allowed opacity-55 hover:bg-transparent',
            isActive && !isLockedList && 'bg-sidebar-accent text-sidebar-accent-foreground',
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
              {(item.spaceIcon && item.spaceIcon.trim()) || item.name[0]}
            </span>
          )}
          {item.type === 'list' && (
            item.isRestricted ? (
              <Lock
                className="w-4 h-4 flex-shrink-0 text-amber-500"
                aria-label="Restricted list"
              />
            ) : item.listColor ? (
              <span
                className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px]"
                style={{ backgroundColor: item.listColor }}
                aria-hidden
              >
                <ListChecks className="h-3 w-3 text-white/90" />
              </span>
            ) : (
              <ListChecks className="w-4 h-4 flex-shrink-0 text-sidebar-muted" />
            )
          )}
          {item.type === 'discussion' && (
            <MessageSquare className="w-4 h-4 flex-shrink-0 text-sidebar-muted" />
          )}

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
                  openPrompt({
                    title: 'New Department',
                    label: 'Department / team space name',
                    placeholder: 'e.g. Marketing',
                    submitText: 'Create',
                    onSubmit: (value) => onCreateSpace(value),
                  });
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
                  openNewListModal(item.id);
                }}
                className="text-sidebar-muted hover:text-sidebar-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                title="Add list"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {(canManageLists || canDeleteSpaces) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded p-1 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      aria-label="Space options"
                      title="Space options"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {onUpdateSpaceDetails && canManageLists && (
                      <DropdownMenuItem
                        onSelect={() => openSpaceRenameModal({ id: item.id, name: item.name })}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                      </DropdownMenuItem>
                    )}
                    {onUpdateSpaceDetails && canManageLists && (
                      <DropdownMenuItem
                        onSelect={() =>
                          openSpaceAppearanceModal({
                            id: item.id,
                            name: item.name,
                            color: item.color ?? null,
                            icon: item.spaceIcon ?? null,
                          })
                        }
                      >
                        <Palette className="h-3.5 w-3.5 mr-2" /> Color &amp; icon
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={() => {
                        const url = `${window.location.origin}${window.location.pathname}?space=${item.id}`;
                        navigator.clipboard
                          .writeText(url)
                          .then(() => toast.success('Link copied'))
                          .catch(() => toast.error('Copy failed'));
                      }}
                    >
                      <LinkIcon className="h-3.5 w-3.5 mr-2" /> Copy link
                    </DropdownMenuItem>
                    {onFetchArchivedLists && canManageLists && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => openArchivedModal(item.id, item.name)}>
                          <Archive className="h-3.5 w-3.5 mr-2" /> View archived lists
                        </DropdownMenuItem>
                      </>
                    )}
                    {canDeleteSpaces && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onDeleteSpace(item.id, item.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
          {item.type === 'list' && renderListRowActions(item)}
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
              openPrompt({
                title: 'New Workspace',
                label: 'Workspace name',
                placeholder: 'e.g. Team Workspace',
                submitText: 'Create',
                onSubmit: (value) => onCreateWorkspace(value),
              });
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
                  children: (space.children ?? []).map((child) => {
                    const siblingIds = child.lists.map((l) => l.id);
                    return {
                      id: child.id,
                      name: child.name,
                      color: child.color,
                      spaceIcon: child.spaceIcon ?? null,
                      openListId: child.spaceForView ? undefined : child.lists[0]?.id,
                      spaceForView: child.spaceForView,
                      noExpand: child.noExpand,
                      type: 'space' as const,
                      children: child.lists.map((list) => ({
                        id: list.id,
                        name: list.name,
                        type: 'list' as const,
                        isRestricted: list.isRestricted,
                        accessLocked: list.accessLocked,
                        canEditAccess: list.canEditAccess,
                        allowedUserIds: list.allowedUserIds,
                        isFavorited: list.isFavorited,
                        listColor: list.color ?? null,
                        listCreatedBy: list.createdBy ?? null,
                        listCreatedAt: list.createdAt,
                        listDescription: list.description ?? null,
                        listSpaceId: child.id,
                        listSiblingIds: siblingIds,
                      })),
                    };
                  }),
                });
              }
              const siblingIds = (space.lists ?? []).map((l) => l.id);
              return renderItem({
                id: space.id,
                name: space.name,
                color: space.color,
                spaceIcon: space.spaceIcon ?? null,
                type: 'space',
                children: (space.lists ?? []).map((list) => ({
                  id: list.id,
                  name: list.name,
                  type: 'list' as const,
                  isRestricted: list.isRestricted,
                  accessLocked: list.accessLocked,
                  canEditAccess: list.canEditAccess,
                  allowedUserIds: list.allowedUserIds,
                  isFavorited: list.isFavorited,
                  listColor: list.color ?? null,
                  listCreatedBy: list.createdBy ?? null,
                  listCreatedAt: list.createdAt,
                  listDescription: list.description ?? null,
                  listSpaceId: space.id,
                  listSiblingIds: siblingIds,
                })),
              });
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="relative flex items-center gap-1 border-t border-sidebar-border/70 p-2">
        <button
          onClick={() => onLogout()}
          className="flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
        <ThemeToggle
          variant="menu"
          className="flex-shrink-0 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        />
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
                {/* `employee` is the backend role key; UI copy is "Team Member"
                   so the label doesn't read oddly to staff. */}
                <option value="employee">Team Member</option>
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
    {promptState && (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closePrompt();
        }}
      >
        <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{promptState.title}</h3>
            <button
              type="button"
              onClick={closePrompt}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPrompt();
            }}
          >
            <div className="space-y-3 p-4">
              <label className="block text-xs font-medium text-muted-foreground">
                {promptState.label}
              </label>
              <input
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closePrompt();
                  }
                }}
                placeholder={promptState.placeholder}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={closePrompt}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!promptValue.trim()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {promptState.submitText ?? 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    {newListState && (
      <div
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeNewListModal();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">New List</h3>
            <button
              type="button"
              onClick={closeNewListModal}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void submitNewList();
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground">
                  List name
                </label>
                <input
                  autoFocus
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      closeNewListModal();
                    }
                  }}
                  placeholder="e.g. landing pages"
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <label className="flex items-start gap-2 rounded-md border border-input bg-background/60 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={newListRestricted}
                  onChange={(e) => setNewListRestricted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Lock className="h-3.5 w-3.5 text-amber-500" />
                    Restrict access
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Only you, admins, and the people selected below will be able to see this list.
                  </span>
                </span>
              </label>

              {newListRestricted && (
                <div className="flex min-h-0 flex-1 flex-col rounded-md border border-input">
                  <div className="border-b border-input p-2">
                    <input
                      value={newListMemberQuery}
                      onChange={(e) => setNewListMemberQuery(e.target.value)}
                      placeholder="Search members..."
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="max-h-56 min-h-0 flex-1 overflow-y-auto p-1 [scrollbar-width:thin]">
                    {filteredMemberOptions.length === 0 && (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No members found.
                      </p>
                    )}
                    {filteredMemberOptions.map((m) => {
                      const isSelf = Boolean(currentUserId && m.id === currentUserId);
                      const checked = isSelf || newListAllowed.has(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleAllowedMember(m.id)}
                          disabled={isSelf}
                          className="group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-foreground">{m.label}</span>
                            {isSelf && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                You (always included)
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'ml-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input bg-background'
                            )}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between border-t border-input px-3 py-2 text-[11px] text-muted-foreground">
                    <span>
                      {newListAllowed.size === 0
                        ? 'Only you + admin'
                        : `${newListAllowed.size} member${newListAllowed.size === 1 ? '' : 's'} + you + admin`}
                    </span>
                    {newListAllowed.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewListAllowed(new Set())}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={closeNewListModal}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newListName.trim()}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    {editAccessState && (
      <div
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !editAccessSaving) closeEditAccessModal();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">
                Edit access — {editAccessState.listName}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeEditAccessModal}
              disabled={editAccessSaving}
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEditAccess();
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <label className="flex items-start gap-2 rounded-md border border-input bg-background/60 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={editAccessRestricted}
                  onChange={(e) => setEditAccessRestricted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Lock className="h-3.5 w-3.5 text-amber-500" />
                    Restrict access
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    If unchecked, the list will be visible and accessible to everyone
                    (default department rules apply).
                  </span>
                </span>
              </label>

              {editAccessRestricted && (
                <div className="flex min-h-0 flex-1 flex-col rounded-md border border-input">
                  <div className="border-b border-input p-2">
                    <input
                      value={editAccessMemberQuery}
                      onChange={(e) => setEditAccessMemberQuery(e.target.value)}
                      placeholder="Search members..."
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="max-h-56 min-h-0 flex-1 overflow-y-auto p-1 [scrollbar-width:thin]">
                    {filteredEditAccessMembers.length === 0 && (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No members found.
                      </p>
                    )}
                    {filteredEditAccessMembers.map((m) => {
                      const isSelf = Boolean(currentUserId && m.id === currentUserId);
                      const checked = isSelf || editAccessAllowed.has(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleEditAccessMember(m.id)}
                          disabled={isSelf}
                          className="group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-foreground">{m.label}</span>
                            {isSelf && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                You (always included)
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'ml-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input bg-background'
                            )}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between border-t border-input px-3 py-2 text-[11px] text-muted-foreground">
                    <span>
                      {editAccessAllowed.size === 0
                        ? 'Only you + admin'
                        : `${editAccessAllowed.size} member${editAccessAllowed.size === 1 ? '' : 's'} + you + admin`}
                    </span>
                    {editAccessAllowed.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditAccessAllowed(new Set())}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={closeEditAccessModal}
                disabled={editAccessSaving}
                className="h-9 rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editAccessSaving}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editAccessSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Rename space modal ---------------------------------------------- */}
    {spaceRenameState && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Rename department</h3>
            <button
              type="button"
              onClick={() => setSpaceRenameState(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close rename"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitSpaceRename();
            }}
            className="p-4 space-y-3"
          >
            <label className="text-xs text-muted-foreground">Department name</label>
            <input
              autoFocus
              value={spaceRenameValue}
              onChange={(e) => setSpaceRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSpaceRenameState(null);
              }}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              maxLength={120}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSpaceRenameState(null)}
                className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!spaceRenameValue.trim() || spaceRenameValue.trim() === spaceRenameState.name}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Space appearance modal — color + short icon label --------------- */}
    {spaceAppearanceState && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">
              Appearance — {spaceAppearanceState.name}
            </h3>
            <button
              type="button"
              onClick={() => setSpaceAppearanceState(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close appearance"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-5">
            {/* Preview chip */}
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold text-white"
                style={{
                  backgroundColor: spaceAppearanceState.color || '#7C3AED',
                }}
              >
                {(spaceAppearanceState.icon && spaceAppearanceState.icon.trim()) ||
                  spaceAppearanceState.name[0] ||
                  '?'}
              </span>
              <div className="text-xs text-muted-foreground">
                Preview — how this department will appear in the sidebar.
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {LIST_COLOR_SWATCHES.filter((s) => s.value !== null).map((swatch) => {
                  const selected = spaceAppearanceState.color === swatch.sample;
                  return (
                    <button
                      key={swatch.label}
                      type="button"
                      onClick={() =>
                        setSpaceAppearanceState((prev) =>
                          prev ? { ...prev, color: swatch.sample } : prev
                        )
                      }
                      className={cn(
                        'flex h-10 items-center justify-center rounded-md border text-[11px] font-medium transition-all',
                        selected
                          ? 'border-primary ring-2 ring-primary/40'
                          : 'border-input hover:border-foreground/30'
                      )}
                      title={swatch.label}
                    >
                      <span
                        className="h-5 w-5 rounded"
                        style={{ backgroundColor: swatch.sample }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">
                Icon label (optional, 1-4 characters)
              </label>
              <input
                value={spaceAppearanceState.icon ?? ''}
                maxLength={4}
                placeholder="e.g. W"
                onChange={(e) =>
                  setSpaceAppearanceState((prev) =>
                    prev ? { ...prev, icon: e.target.value } : prev
                  )
                }
                className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave empty to default to the first letter of the department name.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setSpaceAppearanceState(null)}
              className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitSpaceAppearance}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Rename list modal ----------------------------------------------- */}
    {renameState && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Rename list</h3>
            <button
              type="button"
              onClick={() => setRenameState(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close rename"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRename();
            }}
            className="p-4 space-y-3"
          >
            <label className="text-xs text-muted-foreground">List name</label>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenameState(null);
              }}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              maxLength={120}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRenameState(null)}
                className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!renameValue.trim() || renameValue.trim() === renameState.name}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Color & icon modal --------------------------------------------- */}
    {appearanceState && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">
              Appearance — {appearanceState.name}
            </h3>
            <button
              type="button"
              onClick={() => setAppearanceState(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close appearance"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {LIST_COLOR_SWATCHES.map((swatch) => {
                  const selected = appearanceState.color === swatch.value;
                  return (
                    <button
                      key={swatch.label}
                      type="button"
                      onClick={() =>
                        setAppearanceState((prev) =>
                          prev ? { ...prev, color: swatch.value } : prev
                        )
                      }
                      className={cn(
                        'flex h-10 items-center justify-center rounded-md border text-[11px] font-medium transition-all',
                        selected
                          ? 'border-primary ring-2 ring-primary/40'
                          : 'border-input hover:border-foreground/30'
                      )}
                      title={swatch.label}
                    >
                      <span
                        className="h-5 w-5 rounded"
                        style={{ backgroundColor: swatch.sample }}
                      />
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Choose a tint for the list chip in the sidebar.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setAppearanceState(null)}
              className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAppearance}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* List info modal ------------------------------------------------- */}
    {infoState && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">List info</h3>
            <button
              type="button"
              onClick={() => setInfoState(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close info"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="font-medium">{infoState.name}</p>
            </div>
            {infoState.description && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="text-foreground/90">{infoState.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created by</p>
                <p className="font-medium">
                  {(infoState.createdBy
                    ? memberOptions.find((m) => m.id === infoState.createdBy)?.label
                    : null) ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
                <p className="font-medium">
                  {infoState.createdAt
                    ? new Date(infoState.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                      })
                    : '—'}
                </p>
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Access</p>
              <p className="mt-1 font-medium">
                {infoState.isRestricted ? (
                  <>
                    <Lock className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                    Restricted — {infoState.allowedUserCount} user
                    {infoState.allowedUserCount === 1 ? '' : 's'} allowed
                  </>
                ) : (
                  'Open to everyone in the space'
                )}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setInfoState(null)}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Archived lists viewer ------------------------------------------ */}
    {archivedState && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">
              Archived lists — {archivedState.spaceName}
            </h3>
            <button
              type="button"
              onClick={() => setArchivedState(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close archived"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-4">
            {archivedState.loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : archivedState.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No archived lists here.
              </p>
            ) : (
              <ul className="space-y-2">
                {archivedState.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Archived{' '}
                        {row.archived_at
                          ? new Date(row.archived_at).toLocaleDateString()
                          : '—'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreArchived(row.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setArchivedState(null)}
              className="h-9 rounded-md border border-input px-3 text-sm transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
