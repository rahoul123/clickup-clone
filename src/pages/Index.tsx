import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, UserCircle2, ChevronDown, AlarmClock } from 'lucide-react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { ExportReportDialog } from '@/components/layout/ExportReportDialog';
import { OverdueSettingsDialog } from '@/components/settings/OverdueSettingsDialog';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { HomeInbox } from '@/components/home/HomeInbox';
import { ModernDashboard } from '@/components/dashboard/ModernDashboard';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
import { TeamMembersPage } from '@/components/team/TeamMembersPage';
import { DocsPage } from '@/components/docs/DocsPage';
import { TimesheetsPage } from '@/components/timesheets/TimesheetsPage';
import { ReminderDetailDialog } from '@/components/reminders/ReminderDetailDialog';
import { useAuth } from '@/contexts/AuthContext';
import type {
  AppRole,
  DashboardAnalytics,
  HomeTask,
  List,
  Notification as AppNotification,
  Reminder,
  Space,
  Task,
  TaskStatus,
  Workspace,
  WorkspaceDoc,
} from '@/types';
import { isBuiltinTaskStatus } from '@/types';
import { filterSpacesForExport } from '@/lib/departmentAccess';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';

const Index = () => {
  const { user, signOut } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memberOptions, setMemberOptions] = useState<{ id: string; label: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<
    Array<{ id: string; label: string; role: 'admin' | 'manager' | 'team_lead' | 'employee' | 'guest' }>
  >([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [rolesByWorkspaceId, setRolesByWorkspaceId] = useState<Record<string, AppRole>>({});
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageView, setPageView] = useState<
    'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets' | 'space'
  >('board');
  const [activeSpaceView, setActiveSpaceView] = useState<{ spaceId: string; spaceName: string } | null>(null);
  const [homeTasks, setHomeTasks] = useState<HomeTask[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardAnalytics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [workspaceDocs, setWorkspaceDocs] = useState<WorkspaceDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [taskToOpenId, setTaskToOpenId] = useState<string | null>(null);
  const [exportReportWorkspaceId, setExportReportWorkspaceId] = useState<string | null>(null);
  const [overdueSettingsOpen, setOverdueSettingsOpen] = useState(false);
  // Reminders the current user created or is being notified on. Rendered
  // inside the Home inbox alongside tasks so they're never forgotten.
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedNotificationsRef = useRef(false);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeListEntity = lists.find((list) => list.id === activeList) ?? null;
  const activeSpace = activeListEntity ? spaces.find((space) => space.id === activeListEntity.space_id) ?? null : null;
  const activeSpaceLists = activeSpace ? lists.filter((list) => list.space_id === activeSpace.id) : [];

  const activeRole: AppRole = activeWorkspaceId
    ? rolesByWorkspaceId[activeWorkspaceId] ?? 'employee'
    : 'employee';

  const workspaceSections = useMemo(() => {
    const normalizeDept = (val?: string | null) =>
      String(val || '').toLowerCase().replace(/\s+/g, '').trim();
    const myDept = normalizeDept(user?.department);
    const isMyDepartmentSpace = (space: Space) => {
      if (!myDept) return true;
      const depNorm = normalizeDept(space.department);
      if (depNorm) return depNorm === myDept || depNorm.includes(myDept) || myDept.includes(depNorm);
      const nameNorm = normalizeDept(space.name);
      return Boolean(nameNorm && (nameNorm === myDept || nameNorm.includes(myDept) || myDept.includes(nameNorm)));
    };
    const myUserId = user?.id ?? null;
    // Restricted lists stay visible in the sidebar (with a lock icon) but
    // users who aren't on the allow-list can't open them. This flag is
    // precomputed per workspace so the sidebar item can render muted and the
    // click handler can short-circuit with a friendly message.
    const isAccessLocked = (l: (typeof lists)[number], wsRole: AppRole): boolean => {
      if (!l.is_restricted) return false;
      if (wsRole === 'admin') return false;
      if (myUserId && l.created_by === myUserId) return false;
      const allowed = Array.isArray(l.allowed_user_ids) ? l.allowed_user_ids : [];
      return !(myUserId && allowed.includes(myUserId));
    };
    // Mirror server rule: only creator or workspace admin can change access.
    // Used to gate the "Edit access" button in the sidebar so non-eligible
    // users don't see a control that would just return 403 anyway.
    const canEditAccess = (l: (typeof lists)[number], wsRole: AppRole): boolean => {
      if (wsRole === 'admin') return true;
      return Boolean(myUserId && l.created_by === myUserId);
    };
    // Fallback to createdAt so legacy rows (position === 0 / undefined) still
    // show in the order they were created.
    const sortByListPosition = (a: List, b: List) => {
      const ap = typeof a.position === 'number' && a.position > 0 ? a.position : Date.parse(a.created_at) || 0;
      const bp = typeof b.position === 'number' && b.position > 0 ? b.position : Date.parse(b.created_at) || 0;
      return ap - bp;
    };
    return workspaces.map((ws) => {
      const wsRole = rolesByWorkspaceId[ws.id] ?? 'employee';
      const isAdmin = wsRole === 'admin';
      const wsSpaces = spaces.filter((s) => s.workspace_id === ws.id);
      const master = wsSpaces.find((s) => s.is_master_team_space);
      if (master) {
        const departments = wsSpaces.filter(
          (s) => s.parent_space_id === master.id && !s.is_master_team_space
        );
        return {
          id: ws.id,
          name: ws.name,
          spaces: [
            {
              id: master.id,
              name: master.name,
              color: master.color,
              isMasterFolder: true as const,
              children: departments.map((space) => {
                const canDiscuss = isAdmin || (Boolean(myDept) && isMyDepartmentSpace(space));
                return {
                  id: space.id,
                  name: space.name,
                  color: space.color,
                  spaceIcon: space.icon ?? null,
                  noExpand: !isAdmin && Boolean(myDept) && !isMyDepartmentSpace(space),
                  showDiscussion: canDiscuss,
                  spaceForView: canDiscuss,
                  lists: lists
                    .filter((l) => l.space_id === space.id && !l.archived_at)
                    .slice()
                    .sort(sortByListPosition)
                    .map((l) => ({
                      id: l.id,
                      name: l.name,
                      isRestricted: Boolean(l.is_restricted),
                      accessLocked: isAccessLocked(l, wsRole),
                      canEditAccess: canEditAccess(l, wsRole),
                      allowedUserIds: Array.isArray(l.allowed_user_ids) ? [...l.allowed_user_ids] : [],
                      isFavorited: Boolean(l.is_favorited),
                      color: l.color ?? null,
                      icon: l.icon ?? null,
                      createdBy: l.created_by ?? null,
                      createdAt: l.created_at,
                      description: l.description ?? null,
                    })),
                };
              }),
            },
          ],
        };
      }
      return {
        id: ws.id,
        name: ws.name,
        spaces: wsSpaces.map((space) => ({
          id: space.id,
          name: space.name,
          color: space.color,
          spaceIcon: space.icon ?? null,
          lists: lists
            .filter((l) => l.space_id === space.id && !l.archived_at)
            .slice()
            .sort(sortByListPosition)
            .map((l) => ({
              id: l.id,
              name: l.name,
              isRestricted: Boolean(l.is_restricted),
              accessLocked: isAccessLocked(l, wsRole),
              canEditAccess: canEditAccess(l, wsRole),
              allowedUserIds: Array.isArray(l.allowed_user_ids) ? [...l.allowed_user_ids] : [],
              isFavorited: Boolean(l.is_favorited),
              color: l.color ?? null,
              icon: l.icon ?? null,
              createdBy: l.created_by ?? null,
              createdAt: l.created_at,
              description: l.description ?? null,
            })),
        })),
      };
    });
  }, [workspaces, spaces, lists, rolesByWorkspaceId, user?.department]);

  const addTaskDepartmentOptions = useMemo(() => {
    if (!activeWorkspaceId) return [] as Array<{ id: string; name: string }>;
    const section = workspaceSections.find((s) => s.id === activeWorkspaceId);
    const master = section?.spaces.find((s) => 'isMasterFolder' in s && s.isMasterFolder);
    if (!master || !('children' in master) || !master.children) return [] as Array<{ id: string; name: string }>;
    return master.children
      .map((child) => ({
        id: child.lists[0]?.id ?? '',
        name: child.name,
      }))
      .filter((x) => Boolean(x.id));
  }, [activeWorkspaceId, workspaceSections]);

  const exportWorkspaceEntity = useMemo(
    () => workspaces.find((w) => w.id === exportReportWorkspaceId) ?? null,
    [workspaces, exportReportWorkspaceId]
  );

  const exportRole: AppRole = useMemo(
    () =>
      exportReportWorkspaceId
        ? rolesByWorkspaceId[exportReportWorkspaceId] ?? 'employee'
        : 'employee',
    [exportReportWorkspaceId, rolesByWorkspaceId]
  );

  const exportDepartmentSpaces = useMemo(() => {
    if (!exportReportWorkspaceId || !exportWorkspaceEntity) return [];
    const raw = spaces.filter(
      (s) => s.workspace_id === exportReportWorkspaceId && !s.is_master_team_space
    );
    const allowed = filterSpacesForExport(exportRole, user?.department ?? null, exportWorkspaceEntity, raw);
    return allowed.map((s) => ({ id: s.id, name: s.name }));
  }, [exportReportWorkspaceId, exportWorkspaceEntity, spaces, exportRole, user?.department]);

  const exportListsMeta = useMemo(() => {
    if (!exportReportWorkspaceId || !exportWorkspaceEntity) return [];
    const raw = spaces.filter(
      (s) => s.workspace_id === exportReportWorkspaceId && !s.is_master_team_space
    );
    const allowedSpaceIds = new Set(
      filterSpacesForExport(exportRole, user?.department ?? null, exportWorkspaceEntity, raw).map((s) => s.id)
    );
    return lists
      .filter((l) => allowedSpaceIds.has(l.space_id))
      .map((l) => ({ id: l.id, name: l.name, space_id: l.space_id }));
  }, [exportReportWorkspaceId, exportWorkspaceEntity, spaces, lists, exportRole, user?.department]);

  const spaceNameByIdExport = useMemo(
    () => Object.fromEntries(spaces.map((s) => [s.id, s.name])) as Record<string, string>,
    [spaces]
  );

  const listNameByIdExport = useMemo(
    () => Object.fromEntries(lists.map((l) => [l.id, l.name])) as Record<string, string>,
    [lists]
  );

  const fetchTasksForExportLists = useCallback(async (listIds: string[]) => {
    const out: Task[] = [];
    for (const id of listIds) {
      const { tasks } = await api.app.listTasks(id);
      out.push(...((tasks ?? []) as Task[]));
    }
    return out;
  }, []);

  const canManageWorkspace = activeRole === 'admin';
  const canInviteMembers = activeRole === 'admin';
  const canCreateSpaces = activeRole === 'admin';
  /** Kanban column (group) add/edit/rename/delete — admin only. */
  const canManageStructure = activeRole === 'admin';
  /** Folder/list create & delete — admin / manager / team lead. */
  const canManageLists =
    activeRole === 'admin' || activeRole === 'manager' || activeRole === 'team_lead';
  const canDeleteSpaces = activeRole === 'admin';
  const canCreateTasks = activeRole !== 'guest';
  const userDisplayLabel = user?.displayName?.trim() || user?.email || 'User';
  // Lookup table shared with dialogs/panels that need to show user display names
  // (e.g. reminder notify chips) without pulling the full option list around.
  const memberLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    memberOptions.forEach((m) => {
      map[m.id] = m.label;
    });
    return map;
  }, [memberOptions]);
  const formatStatusLabel = (status: string) => {
    if (isBuiltinTaskStatus(status)) {
      return status
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    const custom = activeListEntity?.kanban_custom_columns?.find((c) => c.id === status);
    if (custom) return custom.label;
    const override = activeListEntity?.kanban_column_labels?.[status];
    if (override) return override;
    return status.replace(/^custom_/, '').slice(0, 12) || status;
  };

  const hydrateTasks = async (listId: string) => {
    const result = await api.app.listTasks(listId);
    setTasks(result.tasks ?? []);
  };

  const fetchHomeTasks = useCallback(async () => {
    setHomeLoading(true);
    try {
      const data = await api.app.homeTasks();
      setHomeTasks((data.tasks ?? []) as HomeTask[]);
    } catch (error) {
      console.error('Failed to load home tasks', error);
    } finally {
      setHomeLoading(false);
    }
  }, []);

  const fetchDashboardAnalytics = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const data = await api.app.dashboardAnalytics(activeWorkspaceId);
      setDashboardData(data as DashboardAnalytics);
    } catch (error) {
      console.error('Failed to load dashboard analytics', error);
    } finally {
      setDashboardLoading(false);
    }
  }, [activeWorkspaceId]);

  const bootstrapWorkspace = async () => {
    if (!user) return;
    setLoading(true);
    const data = await api.app.bootstrap();
    setWorkspaces(data.workspaces as Workspace[]);
    setSpaces(data.spaces as Space[]);
    setLists(data.lists as List[]);
    setTasks(data.tasks as Task[]);
    setMemberOptions(data.memberOptions ?? []);
    setTeamMembers(data.teamMembers ?? []);
    setActiveWorkspaceId(data.activeWorkspaceId ?? null);
    setActiveList(data.activeListId ?? null);
    const rb = data.rolesByWorkspaceId as Record<string, AppRole> | undefined;
    const wid = data.activeWorkspaceId as string | undefined;
    const fallback = (data.activeRole ?? 'employee') as AppRole;
    setRolesByWorkspaceId(rb ?? (wid ? { [wid]: fallback } : {}));

    setLoading(false);
  };

  const playNotificationSound = useCallback(() => {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.22);
    } catch (error) {
      console.error('Notification sound failed', error);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const result = await api.app.notifications();
      const next = (result.notifications ?? []) as AppNotification[];
      setNotificationUnreadCount(result.unreadCount ?? 0);
      setNotifications(next);

      const unread = next.filter((n) => !n.read);
      const newUnread = unread.filter((n) => !seenNotificationIdsRef.current.has(n.id));

      if (initializedNotificationsRef.current && newUnread.length > 0) {
        for (const item of newUnread.slice(0, 3)) {
          toast(item.message);
          if (typeof document !== 'undefined' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            // Browser-level popup for background/inactive tab
            new Notification('Collab Creek', { body: item.message, tag: item.id });
          }
        }
        playNotificationSound();
      }

      seenNotificationIdsRef.current = new Set(next.map((n) => n.id));
      initializedNotificationsRef.current = true;
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [playNotificationSound]);

  // ────────────────────────────────────────────────────────────────────
  // Realtime fan-in: patch local caches when other users mutate things.
  //
  // Rationale: the REST endpoints still return the freshest data, but without
  // this wiring a second client has to refresh the page to see changes. Each
  // handler only touches the piece of state it owns so there's no stampede
  // of re-fetches on every broadcast.
  // ────────────────────────────────────────────────────────────────────
  useRealtimeEvent<{ task: Task; list_id: string }>('task:created', ({ task }) => {
    if (!task?.id) return;
    setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
  });

  useRealtimeEvent<{ task_id: string; list_id: string; task?: Task; patch?: Partial<Task> }>(
    'task:updated',
    ({ task_id, task, patch }) => {
      if (!task_id) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === task_id ? { ...t, ...(task ?? patch ?? {}) } : t)),
      );
      setHomeTasks((prev) =>
        prev.map((t) =>
          t.id === task_id ? { ...t, ...(task ?? patch ?? {}) } : t,
        ) as HomeTask[],
      );
    },
  );

  useRealtimeEvent<{ task_id: string }>('task:deleted', ({ task_id }) => {
    if (!task_id) return;
    setTasks((prev) => prev.filter((t) => t.id !== task_id));
    setHomeTasks((prev) => prev.filter((t) => t.id !== task_id));
  });

  useRealtimeEvent<AppNotification>('notification:new', (notification) => {
    if (!notification?.id) return;
    setNotifications((prev) =>
      prev.some((n) => n.id === notification.id) ? prev : [notification, ...prev],
    );
    if (!notification.read) {
      setNotificationUnreadCount((prev) => prev + 1);
    }
    toast(notification.message);
    if (
      typeof document !== 'undefined' &&
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('DigitechIO', { body: notification.message, tag: notification.id });
    }
    playNotificationSound();
  });

  const fetchWorkspaceDocs = useCallback(async (workspaceId?: string | null) => {
    if (!workspaceId) {
      setWorkspaceDocs([]);
      return;
    }
    setDocsLoading(true);
    try {
      const result = await api.app.workspaceDocs(workspaceId);
      setWorkspaceDocs((result.docs ?? []) as WorkspaceDoc[]);
    } catch (error) {
      console.error('Failed to load workspace docs', error);
      setWorkspaceDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapWorkspace().catch((error) => {
      console.error('Failed to bootstrap workspace', error);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    let timer: number | null = null;
    fetchNotifications();
    timer = window.setInterval(fetchNotifications, 15000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [user?.id, fetchNotifications]);

  const fetchReminders = useCallback(async () => {
    try {
      const result = await api.app.listReminders();
      setReminders((result?.reminders ?? []) as Reminder[]);
    } catch (error) {
      console.error('Failed to fetch reminders', error);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchReminders();
    // Reminders are fired by the backend scheduler; polling every 60s keeps
    // the Home inbox fresh without hammering the API on every notification tick.
    const timer = window.setInterval(fetchReminders, 60000);
    return () => window.clearInterval(timer);
  }, [user?.id, fetchReminders]);

  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user || loading) return;
    const params = new URLSearchParams(window.location.search);
    const deepTaskId = params.get('task');
    if (!deepTaskId) return;
    handleOpenNotificationTask(deepTaskId).catch((err) =>
      console.error('Failed to open task from shared link', err),
    );
    params.delete('task');
    const nextQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', cleanUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading]);

  const handleSelectList = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    const space = list ? spaces.find((s) => s.id === list.space_id) : null;
    if (space) setActiveWorkspaceId(space.workspace_id);
    setActiveList(listId);
    setPageView('board');
    hydrateTasks(listId).catch((error) => console.error('Failed to load tasks', error));
  };

  const handleNavigate = (
    view: 'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets'
  ) => {
    setPageView(view);
    if (view === 'home') {
      fetchHomeTasks().catch((error) => console.error('Failed to load home tasks', error));
    }
    if (view === 'dashboard') {
      fetchDashboardAnalytics().catch((error) => console.error('Failed to load dashboard analytics', error));
    }
    if (view === 'notifications') {
      fetchNotifications().catch((error) => console.error('Failed to load notifications', error));
    }
    if (view === 'docs') {
      fetchWorkspaceDocs(activeWorkspaceId).catch((error) => console.error('Failed to load docs', error));
    }
  };

  const handleSwitchWorkspace = (workspaceId: string) => {
    if (!workspaceId) return;
    setActiveWorkspaceId(workspaceId);
    const workspaceSpaceIds = spaces.filter((space) => space.workspace_id === workspaceId).map((space) => space.id);
    const firstList = lists.find((list) => workspaceSpaceIds.includes(list.space_id)) ?? null;

    if (firstList) {
      setActiveList(firstList.id);
      if (pageView === 'board') {
        hydrateTasks(firstList.id).catch((error) => console.error('Failed to load tasks after workspace switch', error));
      }
    } else {
      setActiveList(null);
      setTasks([]);
    }
    if (pageView === 'docs') {
      fetchWorkspaceDocs(workspaceId).catch((error) => console.error('Failed to load docs after workspace switch', error));
    }
  };

  const handleOpenNotificationTask = async (taskId: string) => {
    try {
      const localTask = homeTasks.find((t) => t.id === taskId) ?? tasks.find((t) => t.id === taskId);
      let listId = localTask?.list_id ?? null;
      let workspaceId = null as string | null;

      if (!listId) {
        const result = await api.app.getTask(taskId);
        listId = result?.task?.list_id ?? null;
        workspaceId = result?.context?.workspace_id ?? null;
      } else {
        const list = lists.find((l) => l.id === listId);
        const space = list ? spaces.find((s) => s.id === list.space_id) : null;
        workspaceId = space?.workspace_id ?? null;
      }

      if (!listId) return;
      if (workspaceId) setActiveWorkspaceId(workspaceId);
      setActiveList(listId);
      setPageView('board');
      setTaskToOpenId(taskId);
      await hydrateTasks(listId);
    } catch (error) {
      console.error('Failed to open task from notification', error);
      toast.error('Could not open task. This may be an access issue.');
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await api.app.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setNotificationUnreadCount((prev) => (prev > 0 ? prev - 1 : 0));
    } catch (error) {
      console.error('Failed to mark notification read', error);
    }
  };

  const handleOpenSpaceView = async (spaceId: string, spaceName: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (space) setActiveWorkspaceId(space.workspace_id);
    setActiveSpaceView({ spaceId, spaceName });
    setActiveList(null);
    setPageView('space');
    try {
      const data = await api.app.listSpaceTasks(spaceId);
      setTasks((data.tasks ?? []) as Task[]);
    } catch (error) {
      console.error('Failed to load space tasks', error);
      setTasks([]);
    }
  };

  const openTaskFromHome = (task: HomeTask) => {
    const list = lists.find((l) => l.id === task.list_id);
    const space = list ? spaces.find((s) => s.id === list.space_id) : null;
    if (space) setActiveWorkspaceId(space.workspace_id);
    setActiveList(task.list_id);
    setPageView('board');
    setTaskToOpenId(task.id);
    hydrateTasks(task.list_id).catch((error) => console.error('Failed to load tasks', error));
  };

  const createWorkspace = async (name: string) => {
    if (!user) return;
    const department = window.prompt('Department name for this workspace (e.g. Web Development)')?.trim();
    if (!department) return;
    const { workspace: data } = await api.app.createWorkspace(name, department);
    setWorkspaces((prev) => [...prev, data]);
    setActiveWorkspaceId(data.id);
    setRolesByWorkspaceId((prev) => ({ ...prev, [data.id]: 'admin' }));
  };

  const createSpace = async (name: string) => {
    if (!user || !activeWorkspaceId) return;
    if (!canCreateSpaces) {
      window.alert('Only admins can create team spaces.');
      return;
    }
    const suggestedDepartment = activeWorkspace?.department ?? user.department ?? '';
    const department = window.prompt('Department for this team space', suggestedDepartment)?.trim();
    if (!department) return;
    const { space: data } = await api.app.createSpace(activeWorkspaceId, name, department);
    setSpaces((prev) => [...prev, data]);
  };

  const createList = async (
    spaceId: string,
    name: string,
    access?: { isRestricted: boolean; allowedUserIds: string[] }
  ) => {
    if (!user) return;
    if (!canManageLists) {
      window.alert('Your role does not have permission to create lists.');
      return;
    }
    const { list: data } = await api.app.createList(spaceId, name, access);
    setLists((prev) => [...prev, data]);
    setActiveList(data.id);
    setTasks([]);
  };

  const updateListAccess = async (
    listId: string,
    payload: { isRestricted: boolean; allowedUserIds: string[] }
  ) => {
    const { list: updated } = await api.app.updateListAccess(listId, payload);
    setLists((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  };

  const mergeListIntoState = (updated: List) => {
    setLists((prev) => {
      if (prev.some((l) => l.id === updated.id)) {
        return prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l));
      }
      return [...prev, updated];
    });
  };

  const updateListDetails = async (
    listId: string,
    payload: {
      name?: string;
      color?: string | null;
      icon?: string | null;
      description?: string | null;
      defaultTaskType?: List['default_task_type'];
    }
  ) => {
    const { list: updated } = await api.app.updateListDetails(listId, payload);
    mergeListIntoState(updated as List);
  };

  const duplicateList = async (listId: string) => {
    const { list: created } = await api.app.duplicateList(listId);
    setLists((prev) => [...prev, created]);
    // Jump to the new copy so the user sees the result immediately.
    setActiveList(created.id);
    setTasks([]);
  };

  const reorderLists = async (spaceId: string, orderedListIds: string[]) => {
    // Optimistic reorder — rewrite local `position` to match payload so the
    // sidebar snaps into place instantly; a failure just re-fetches by
    // bootstrap on next sign-in.
    setLists((prev) => {
      const positionByListId = new Map<string, number>();
      orderedListIds.forEach((id, idx) => positionByListId.set(id, idx + 1));
      return prev.map((l) =>
        positionByListId.has(l.id) ? { ...l, position: positionByListId.get(l.id) } : l
      );
    });
    try {
      await api.app.reorderLists(spaceId, orderedListIds);
    } catch (err) {
      console.error('Failed to reorder lists', err);
    }
  };

  const archiveList = async (listId: string) => {
    const { list: updated } = await api.app.archiveList(listId);
    setLists((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
    // If we just archived the active list, switch to any remaining active one.
    if (activeList === listId) {
      const fallback = (lists as List[]).find((l) => l.id !== listId && !l.archived_at);
      setActiveList(fallback?.id ?? null);
      setTasks([]);
    }
  };

  const unarchiveList = async (listId: string) => {
    const { list: updated } = await api.app.unarchiveList(listId);
    setLists((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  };

  const toggleFavoriteList = async (listId: string, nextFavorited: boolean) => {
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, is_favorited: nextFavorited } : l)));
    try {
      if (nextFavorited) await api.app.favoriteList(listId);
      else await api.app.unfavoriteList(listId);
    } catch (err) {
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, is_favorited: !nextFavorited } : l)));
      console.error('Failed to toggle favorite', err);
    }
  };

  const fetchArchivedLists = async (spaceId: string): Promise<List[]> => {
    const { lists: archived } = await api.app.getArchivedLists(spaceId);
    return archived as List[];
  };

  const updateSpaceDetails = async (
    spaceId: string,
    payload: { name?: string; color?: string | null; icon?: string | null }
  ) => {
    const { space: updated } = await api.app.updateSpaceDetails(spaceId, payload);
    setSpaces((prev) => prev.map((s) => (s.id === spaceId ? (updated as Space) : s)));
  };

  const deleteSpace = async (spaceId: string, spaceName: string) => {
    if (!canDeleteSpaces) {
      window.alert('Only admin/manager can delete team spaces.');
      return;
    }
    const ok = window.confirm(`Are you sure you want to delete space "${spaceName}"?`);
    if (!ok) return;
    await api.app.deleteSpace(spaceId);
    setSpaces((prev) => prev.filter((space) => space.id !== spaceId));
    setLists((prev) => prev.filter((list) => list.space_id !== spaceId));
    setTasks((prev) => prev.filter((task) => {
      const removedListIds = lists.filter((list) => list.space_id === spaceId).map((list) => list.id);
      return !removedListIds.includes(task.list_id);
    }));
    if (activeList) {
      const activeListInDeletedSpace = lists.find((list) => list.id === activeList && list.space_id === spaceId);
      if (activeListInDeletedSpace) {
        const nextList = lists.find((list) => list.space_id !== spaceId);
        setActiveList(nextList?.id ?? null);
        setTasks([]);
      }
    }
  };

  const deleteList = async (listId: string, listName: string) => {
    if (!canManageLists) {
      window.alert('Your role does not have permission to delete lists.');
      return;
    }
    const ok = window.confirm(`Are you sure you want to delete list "${listName}"?`);
    if (!ok) return;
    await api.app.deleteList(listId);
    setLists((prev) => prev.filter((list) => list.id !== listId));
    setTasks((prev) => prev.filter((task) => task.list_id !== listId));
    if (activeList === listId) {
      const nextList = lists.find((list) => list.id !== listId);
      setActiveList(nextList?.id ?? null);
      if (nextList) {
        hydrateTasks(nextList.id).catch((error) => console.error('Failed to load tasks', error));
      } else {
        setTasks([]);
      }
    }
  };

  const inviteMember = async (
    email: string,
    role: 'employee' | 'team_lead' | 'manager' | 'admin',
    department: string
  ) => {
    if (!activeWorkspaceId) return;
    if (!canInviteMembers) {
      window.alert('Only admins can send invites.');
      return;
    }
    const result = await api.app.inviteMember(activeWorkspaceId, email, role, department);
    if (result?.message) {
      window.alert(result.message);
    }
    await bootstrapWorkspace();
  };

  const updateMemberRole = async (memberId: string, role: 'employee' | 'team_lead' | 'manager' | 'admin') => {
    if (!activeWorkspaceId) return;
    if (!canManageWorkspace) {
      window.alert('Only admin can change roles.');
      return;
    }
    await api.app.updateMemberRole(activeWorkspaceId, memberId, role);
    setTeamMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, role } : member)));
  };

  const createTask = async (payload: {
    listId?: string;
    status: string;
    title: string;
    priority: 'urgent' | 'high' | 'normal' | 'low';
    assigneeIds: string[];
    notifyOnlyUserIds?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
    attachments?: File[];
  }) => {
    const targetListId = payload.listId || activeList;
    if (!user || !targetListId) return;
    if (!canCreateTasks) {
      window.alert('Guest role cannot create tasks.');
      return;
    }
    const { task: data } = await api.app.createTask({
      listId: targetListId,
      title: payload.title,
      status: payload.status,
      priority: payload.priority,
      assigneeIds: payload.assigneeIds,
      notifyOnlyUserIds: payload.notifyOnlyUserIds,
      startDate: payload.startDate,
      endDate: payload.endDate,
      description: payload.description,
    });
    setTasks((prev) => {
      // Realtime `task:created` may have already added this task (socket race).
      if (prev.some((t) => t.id === data.id)) return prev;
      return [
        {
          id: data.id,
          list_id: data.list_id,
          title: data.title,
          description: data.description ?? undefined,
          status: data.status,
          priority: data.priority,
          start_date: data.start_date ?? undefined,
          due_date: data.due_date ?? undefined,
          assignee_ids: [],
          created_by: data.created_by,
          created_at: data.created_at,
          updated_at: data.updated_at,
          parent_task_id: data.parent_task_id ?? null,
          checklist: data.checklist ?? [],
          related_task_ids: data.related_task_ids ?? [],
        },
        ...prev,
      ];
    });
    toast.success(`Task "${data.title}" created.`);

    // Persist any files picked via the "Upload file" flow as the first comment attachment.
    if (payload.attachments && payload.attachments.length > 0) {
      try {
        const fileToDataUrl = (file: File) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });
        const attachmentPayloads = await Promise.all(
          payload.attachments.map(async (file) => ({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: await fileToDataUrl(file),
          })),
        );
        await api.app.addTaskComment(data.id, {
          content: `📎 Attached ${attachmentPayloads.length} file${attachmentPayloads.length > 1 ? 's' : ''} on create`,
          attachments: attachmentPayloads,
        });
      } catch (attachError) {
        console.error('Failed to attach files to created task', attachError);
        toast.error('Task created, but some files could not be attached.');
      }
    }

    hydrateTasks(targetListId).catch((refreshError) => console.error('Task refresh failed after create', refreshError));
  };

  const createReminder = async (payload: {
    title: string;
    description?: string;
    dueDate: string;
    notifyUserIds?: string[];
    attachments?: File[];
  }) => {
    if (!user) return;
    if (!activeWorkspaceId) {
      toast.error('Open a workspace before creating a reminder.');
      return;
    }

    // Convert any Files from the composer into base64 data-URL payloads the
    // backend understands (same contract as comment/discussion attachments).
    let attachmentPayloads: Array<{ filename: string; mimeType: string; dataUrl: string }> | undefined;
    if (payload.attachments && payload.attachments.length > 0) {
      try {
        const fileToDataUrl = (file: File) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });
        attachmentPayloads = await Promise.all(
          payload.attachments.map(async (file) => ({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: await fileToDataUrl(file),
          })),
        );
      } catch (readError) {
        console.error('Failed to read reminder attachments', readError);
        toast.error('Could not read one of the attached files.');
        return;
      }
    }

    try {
      await api.app.createReminder({
        workspaceId: activeWorkspaceId,
        title: payload.title,
        description: payload.description,
        dueDate: payload.dueDate,
        notifyUserIds: payload.notifyUserIds,
        attachments: attachmentPayloads,
      });
      const due = new Date(payload.dueDate);
      toast.success(
        `Reminder "${payload.title}" set for ${due.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}. You'll be notified 1 day before and on the day.`
      );
      fetchNotifications().catch((err) => console.error('Failed to refresh notifications', err));
      fetchReminders().catch((err) => console.error('Failed to refresh reminders', err));
    } catch (error) {
      console.error('Failed to create reminder', error);
      toast.error(error instanceof Error ? error.message : 'Could not create reminder.');
    }
  };

  const markReminderDone = async (id: string) => {
    try {
      await api.app.updateReminder(id, { status: 'done' });
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'done' } : r)));
      setActiveReminder((curr) => (curr && curr.id === id ? { ...curr, status: 'done' } : curr));
      toast.success('Reminder marked as done.');
    } catch (error) {
      console.error('Failed to mark reminder done', error);
      toast.error(error instanceof Error ? error.message : 'Could not update reminder.');
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      await api.app.deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setActiveReminder(null);
      toast.success('Reminder deleted.');
    } catch (error) {
      console.error('Failed to delete reminder', error);
      toast.error(error instanceof Error ? error.message : 'Could not delete reminder.');
    }
  };

  const moveTask = async (taskId: string, nextStatus: string) => {
    if (!canCreateTasks) {
      window.alert('Your role does not have drag-and-drop permission.');
      return;
    }
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask || currentTask.status === nextStatus) return;

    const previousTasks = tasks;
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)));
    try {
      await api.app.moveTask(taskId, nextStatus);
      toast.success(`"${currentTask.title}" moved to ${formatStatusLabel(nextStatus)}.`);
    } catch (_error) {
      setTasks(previousTasks);
      toast.error('Task status update failed.');
      throw _error;
    }
  };

  const updateTaskDetails = async (
    taskId: string,
    payload: {
      title?: string;
      description?: string;
      status?: string;
      priority?: 'urgent' | 'high' | 'normal' | 'low';
      assigneeIds?: string[];
      startDate?: string;
      endDate?: string;
      checklist?: Array<{ id?: string; text: string; done: boolean; assigneeIds?: string[] }>;
      relatedTaskIds?: string[];
      defaultPermission?: 'full_edit' | 'edit' | 'comment' | 'view';
      collaborators?: Array<{ userId: string; role: 'full_edit' | 'edit' | 'comment' | 'view' }>;
      isPrivate?: boolean;
    }
  ) => {
    const currentTask = tasks.find((item) => item.id === taskId);
    const previousStatus = currentTask?.status;
    const { task } = await api.app.updateTask(taskId, payload);
    const normalized: Task = {
      id: task.id,
      list_id: task.list_id,
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      priority: task.priority,
      assignee_ids: task.assignee_ids ?? [],
      start_date: task.start_date ?? undefined,
      due_date: task.due_date ?? undefined,
      created_by: task.created_by,
      created_at: task.created_at,
      updated_at: task.updated_at,
      parent_task_id: task.parent_task_id ?? null,
      checklist: task.checklist ?? [],
      related_task_ids: task.related_task_ids ?? [],
      default_permission: task.default_permission ?? 'full_edit',
      collaborators: task.collaborators ?? [],
      is_private: Boolean(task.is_private),
    };
    setTasks((prev) => prev.map((item) => (item.id === taskId ? normalized : item)));
    if (payload.status && previousStatus && payload.status !== previousStatus) {
      toast.success(`"${normalized.title}" moved to ${formatStatusLabel(payload.status)}.`);
    }
    return normalized;
  };

  const createSubtask = async (
    parentTaskId: string,
    payload: {
      title: string;
      priority?: 'urgent' | 'high' | 'normal' | 'low';
      assigneeIds?: string[];
      startDate?: string;
      dueDate?: string;
    }
  ) => {
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) {
      toast.error('Parent task not found.');
      return;
    }
    try {
      const { task: data } = await api.app.createTask({
        listId: parent.list_id,
        title: payload.title,
        status: 'todo',
        priority: payload.priority ?? 'normal',
        assigneeIds: payload.assigneeIds ?? [],
        startDate: payload.startDate,
        endDate: payload.dueDate,
        parentTaskId: parent.id,
      });
      setTasks((prev) => {
        // Realtime `task:created` may have already added this subtask (socket race).
        if (prev.some((t) => t.id === data.id)) return prev;
        return [
          {
            id: data.id,
            list_id: data.list_id,
            title: data.title,
            description: data.description ?? undefined,
            status: data.status,
            priority: data.priority,
            start_date: data.start_date ?? undefined,
            due_date: data.due_date ?? undefined,
            assignee_ids: data.assignee_ids ?? [],
            created_by: data.created_by,
            created_at: data.created_at,
            updated_at: data.updated_at,
            parent_task_id: data.parent_task_id ?? null,
            checklist: data.checklist ?? [],
            related_task_ids: data.related_task_ids ?? [],
          },
          ...prev,
        ];
      });
      toast.success(`Subtask "${data.title}" added.`);
    } catch (error) {
      console.error('Failed to create subtask', error);
      toast.error(error instanceof Error ? error.message : 'Could not create subtask.');
    }
  };

  const searchWorkspaceTasks = async (query: string, excludeTaskId?: string) => {
    if (!activeWorkspaceId) return [];
    try {
      const { tasks: rows } = await api.app.searchTasks(activeWorkspaceId, query, excludeTaskId);
      return rows as Array<{
        id: string;
        title: string;
        status: string;
        list_name?: string | null;
        space_name?: string | null;
      }>;
    } catch (error) {
      console.error('Task search failed', error);
      return [];
    }
  };

  const resolveRelatedTasks = async (taskIds: string[]) => {
    if (taskIds.length === 0 || !activeWorkspaceId) return [];
    // Try the local tasks cache first so we don't hit the API unnecessarily.
    const known = new Map<string, { id: string; title: string; status: string }>();
    for (const t of tasks) {
      if (taskIds.includes(t.id)) known.set(t.id, { id: t.id, title: t.title, status: t.status });
    }
    const missing = taskIds.filter((id) => !known.has(id));
    if (missing.length === 0) {
      return Array.from(known.values());
    }
    // For missing ones, do a series of getTask calls (small count in practice).
    const extra = await Promise.all(
      missing.map(async (id) => {
        try {
          const { task: t } = await api.app.getTask(id);
          return {
            id: t.id as string,
            title: t.title as string,
            status: t.status as string,
            list_name: null as string | null,
            space_name: null as string | null,
          };
        } catch {
          return null;
        }
      }),
    );
    return [...Array.from(known.values()), ...extra.filter(Boolean) as Array<{ id: string; title: string; status: string }>];
  };

  const deleteTaskDetails = async (taskId: string) => {
    await api.app.deleteTask(taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
    if (taskToOpenId === taskId) setTaskToOpenId(null);
    toast.success('Task deleted successfully.');
  };

  /** Low-level helper: patch kanban settings for a specific list id. */
  const patchKanbanForList = useCallback(
    async (
      listId: string,
      payload: {
        kanbanColumnOrder?: string[];
        kanbanColumnLabels?: Partial<Record<string, string>>;
        addKanbanColumn?: { label: string; color?: string };
        updateKanbanCustomColumn?: { id: string; label: string; color?: string };
        deleteKanbanCustomColumn?: { id: string };
        deleteKanbanColumn?: { id: string };
      }
    ) => {
      try {
        const { list } = await api.app.updateListKanban(listId, {
          kanbanColumnOrder: payload.kanbanColumnOrder,
          kanbanColumnLabels: payload.kanbanColumnLabels as Record<string, string> | undefined,
          addKanbanColumn: payload.addKanbanColumn,
          updateKanbanCustomColumn: payload.updateKanbanCustomColumn,
          deleteKanbanCustomColumn: payload.deleteKanbanCustomColumn,
          deleteKanbanColumn: payload.deleteKanbanColumn,
        });
        setLists((prev) =>
          prev.map((l) =>
            l.id === list.id
              ? {
                  ...l,
                  kanban_column_order: list.kanban_column_order ?? null,
                  kanban_column_labels: (list.kanban_column_labels ?? {}) as List['kanban_column_labels'],
                  kanban_custom_columns: (list as List).kanban_custom_columns ?? [],
                }
              : l
          )
        );
        toast.success('Saved.');
      } catch (error) {
        console.error('Failed to update board columns', error);
        toast.error('Board settings save failed.');
      }
    },
    []
  );

  /** Used by the list-view KanbanBoard — targets the currently active list. */
  const patchListKanban = useCallback(
    async (payload: Parameters<typeof patchKanbanForList>[1]) => {
      if (!activeList) return;
      await patchKanbanForList(activeList, payload);
    },
    [activeList, patchKanbanForList]
  );

  if (loading) {
    return <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">Loading workspace...</div>;
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <AppSidebar
        activeList={activeList}
        onSelectList={handleSelectList}
        workspaceName={activeWorkspace?.name ?? 'Team Workspace'}
        workspaceSections={workspaceSections}
        activeWorkspaceId={activeWorkspaceId}
        activeSpaceViewId={pageView === 'space' ? activeSpaceView?.spaceId ?? null : null}
        onOpenSpace={(spaceId, spaceName) =>
          handleOpenSpaceView(spaceId, spaceName).catch((error) =>
            console.error('Failed to open space view', error)
          )
        }
        activeNav={
          pageView === 'home'
            ? 'home'
            : pageView === 'dashboard'
              ? 'dashboard'
              : pageView === 'notifications'
                ? 'notifications'
                : pageView === 'team-members'
                  ? 'team-members'
                  : pageView === 'docs'
                    ? 'docs'
                    : pageView === 'timesheets'
                      ? 'timesheets'
                : 'board'
        }
        onNavigate={handleNavigate}
        onCreateWorkspace={(name) => createWorkspace(name).catch((error) => console.error('Failed to create workspace', error))}
        onCreateSpace={(name) => createSpace(name).catch((error) => console.error('Failed to create space', error))}
        onCreateList={(spaceId, name, access) =>
          createList(spaceId, name, access).catch((error) => console.error('Failed to create list', error))
        }
        onUpdateListAccess={(listId, payload) =>
          updateListAccess(listId, payload).catch((error) => {
            console.error('Failed to update list access', error);
            window.alert((error as Error)?.message || 'Access update failed.');
          })
        }
        onUpdateListDetails={(listId, payload) =>
          updateListDetails(listId, payload).catch((error) => {
            console.error('Failed to update list', error);
            window.alert((error as Error)?.message || 'Update failed.');
          })
        }
        onDuplicateList={(listId) =>
          duplicateList(listId).catch((error) => {
            console.error('Failed to duplicate list', error);
            window.alert((error as Error)?.message || 'Duplicate failed.');
          })
        }
        onReorderLists={(spaceId, orderedListIds) =>
          reorderLists(spaceId, orderedListIds).catch((error) => {
            console.error('Failed to reorder lists', error);
          })
        }
        onArchiveList={(listId) =>
          archiveList(listId).catch((error) => {
            console.error('Failed to archive list', error);
            window.alert((error as Error)?.message || 'Archive failed.');
          })
        }
        onUnarchiveList={(listId) =>
          unarchiveList(listId).catch((error) => {
            console.error('Failed to unarchive list', error);
            window.alert((error as Error)?.message || 'Restore failed.');
          })
        }
        onToggleFavoriteList={(listId, nextFavorited) =>
          toggleFavoriteList(listId, nextFavorited).catch((error) => {
            console.error('Failed to toggle favorite', error);
          })
        }
        onFetchArchivedLists={fetchArchivedLists}
        memberOptions={memberOptions}
        currentUserId={user?.id ?? null}
        onDeleteSpace={(spaceId, spaceName) =>
          deleteSpace(spaceId, spaceName).catch((error) => console.error('Failed to delete space', error))
        }
        onUpdateSpaceDetails={(spaceId, payload) =>
          updateSpaceDetails(spaceId, payload).catch((error) => {
            console.error('Failed to update space', error);
            toast.error(
              error instanceof Error && error.message
                ? `Space update failed: ${error.message}`
                : 'Space update failed.'
            );
          })
        }
        onDeleteList={(listId, listName) =>
          deleteList(listId, listName).catch((error) => console.error('Failed to delete list', error))
        }
        onInvite={(email, role, department) =>
          inviteMember(email, role, department).catch((error) => console.error('Failed to invite member', error))
        }
        canManageWorkspace={canManageWorkspace}
        canInviteMembers={canInviteMembers}
        canCreateSpaces={canCreateSpaces}
        canManageStructure={canManageStructure}
        canManageLists={canManageLists}
        canDeleteSpaces={canDeleteSpaces}
        notificationCount={notificationUnreadCount}
        onLogout={() =>
          signOut().catch((error) => {
            console.error('Failed to logout', error);
          })
        }
        onExportReport={(workspaceId) => setExportReportWorkspaceId(workspaceId)}
        canExportReport={(workspaceId) => {
          const r = rolesByWorkspaceId[workspaceId] ?? 'employee';
          return r === 'admin' || r === 'manager' || r === 'team_lead';
        }}
      />
      <ReminderDetailDialog
        open={Boolean(activeReminder)}
        reminder={activeReminder}
        memberLabelById={memberLabelById}
        onClose={() => setActiveReminder(null)}
        onMarkDone={markReminderDone}
        onDelete={deleteReminder}
      />
      <OverdueSettingsDialog
        open={overdueSettingsOpen}
        onOpenChange={setOverdueSettingsOpen}
        workspaceId={activeWorkspaceId}
        workspaceName={activeWorkspace?.name ?? 'Workspace'}
      />
      <ExportReportDialog
        key={exportReportWorkspaceId ?? 'closed'}
        open={Boolean(exportReportWorkspaceId)}
        onOpenChange={(o) => {
          if (!o) setExportReportWorkspaceId(null);
        }}
        workspaceName={exportWorkspaceEntity?.name ?? 'Workspace'}
        departmentSpaces={exportDepartmentSpaces}
        lists={exportListsMeta}
        spaceNameById={spaceNameByIdExport}
        listNameById={listNameByIdExport}
        fetchTasksForListIds={fetchTasksForExportLists}
        viewerIsAdmin={exportRole === 'admin'}
        scopeAllLabel={
          exportRole === 'admin'
            ? 'All departments (Team Space)'
            : 'All my department team spaces'
        }
        singleDepartmentOnly={exportDepartmentSpaces.length === 1}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="z-40 flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-background/95 px-4 backdrop-blur">
          <div className="flex flex-1 justify-center">
            <GlobalSearch
              workspaceId={activeWorkspaceId}
              spaces={spaces}
              lists={lists}
              docs={workspaceDocs}
              members={memberOptions}
              onOpenTask={(taskId) =>
                handleOpenNotificationTask(taskId).catch((err) =>
                  console.error('Failed to open task from search', err)
                )
              }
              onOpenList={handleSelectList}
              onOpenSpace={(spaceId, spaceName) =>
                handleOpenSpaceView(spaceId, spaceName).catch((err) =>
                  console.error('Failed to open space from search', err)
                )
              }
              onOpenDocs={() => handleNavigate('docs')}
              onOpenTeamMembers={() => handleNavigate('team-members')}
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2 py-1 shadow-sm">
            {activeRole === 'admin' && activeWorkspaceId && (
              <button
                type="button"
                onClick={() => setOverdueSettingsOpen(true)}
                title="Overdue notifications (admin)"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <AlarmClock className="h-3.5 w-3.5 text-red-500" />
                Overdue
              </button>
            )}
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <select
              value={activeWorkspaceId ?? ''}
              onChange={(e) => handleSwitchWorkspace(e.target.value)}
              className="max-w-[140px] truncate bg-transparent text-[11px] font-medium text-foreground outline-none"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
              <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="max-w-[120px] truncate text-[11px] font-medium text-foreground">{userDisplayLabel}</p>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {pageView === 'home' ? (
            <HomeInbox
              tasks={homeTasks}
              loading={homeLoading}
              currentUserId={user?.id ?? null}
              onRefresh={() => {
                fetchHomeTasks().catch((error) => console.error('Failed to refresh home', error));
                fetchReminders().catch((error) => console.error('Failed to refresh reminders', error));
              }}
              onOpenTask={openTaskFromHome}
              reminders={reminders}
              onOpenReminder={(r) => setActiveReminder(r)}
            />
          ) : pageView === 'dashboard' ? (
            <ModernDashboard analytics={dashboardData} loading={dashboardLoading} />
          ) : pageView === 'notifications' ? (
            <NotificationsPanel
              notifications={notifications}
              loading={notificationsLoading}
              onMarkRead={markNotificationRead}
              onOpenTask={handleOpenNotificationTask}
            />
          ) : pageView === 'team-members' ? (
            <TeamMembersPage
              members={teamMembers}
              canManageWorkspace={canManageWorkspace}
              onUpdateMemberRole={(memberId, role) =>
                updateMemberRole(memberId, role).catch((error) => console.error('Failed to update member role', error))
              }
            />
          ) : pageView === 'docs' ? (
            <DocsPage
              workspaceName={activeWorkspace?.name ?? 'Team Workspace'}
              docs={workspaceDocs}
              loading={docsLoading}
              canUpload={canManageWorkspace}
              onUpload={async (payload) => {
                if (!activeWorkspaceId) throw new Error('No active workspace selected');
                await api.app.uploadWorkspaceDoc(activeWorkspaceId, payload);
                await fetchWorkspaceDocs(activeWorkspaceId);
                toast.success('Document uploaded successfully.');
              }}
              onDeleteDoc={async (docId) => {
                if (!activeWorkspaceId) throw new Error('No active workspace selected');
                await api.app.deleteWorkspaceDoc(activeWorkspaceId, docId);
                await fetchWorkspaceDocs(activeWorkspaceId);
                toast.success('Document deleted successfully.');
              }}
            />
          ) : pageView === 'timesheets' ? (
            <TimesheetsPage tasks={tasks} />
          ) : pageView === 'space' && activeSpaceView ? (
            (() => {
              const spaceLists = lists.filter((l) => l.space_id === activeSpaceView.spaceId);
              const firstListId = spaceLists[0]?.id ?? null;
              // The space view groups tasks from all lists in the space; the
              // kanban columns however live on a specific list, so we edit
              // the first list's config. If a manager adds a "group" here,
              // it's added to that list and stays consistent when they drill
              // into it.
              const firstListEntity = spaceLists[0] ?? null;
              return (
                <KanbanBoard
                  workspaceName={activeWorkspace?.name ?? 'Team Workspace'}
                  spaceName={activeSpaceView.spaceName}
                  listName={activeSpaceView.spaceName}
                  listTabs={spaceLists.map((l) => ({ id: l.id, name: l.name }))}
                  addTaskListOptions={spaceLists.map((l) => ({ id: l.id, name: l.name }))}
                  activeListId={firstListId}
                  onSelectList={handleSelectList}
                  tasks={tasks}
                  memberOptions={memberOptions}
                  onCreateTask={(payload) => createTask(payload).catch((error) => console.error('Failed to create task', error))}
                  onMoveTask={(taskId, status) =>
                    moveTask(taskId, status).catch((error) => console.error('Failed to move task', error))
                  }
                  onUpdateTask={(taskId, payload) =>
                    updateTaskDetails(taskId, payload).catch((error) => {
                      console.error('Failed to update task', error);
                      return undefined;
                    })
                  }
                  onDeleteTask={(taskId) =>
                    deleteTaskDetails(taskId).catch((error) => {
                      console.error('Failed to delete task', error);
                      toast.error(
                        error instanceof Error && error.message
                          ? `Task delete failed: ${error.message}`
                          : 'Task delete failed.'
                      );
                    })
                  }
                  canCreateTask={canCreateTasks && Boolean(firstListId)}
                  taskToOpenId={taskToOpenId}
                  onConsumedTaskOpen={() => setTaskToOpenId(null)}
                  kanbanColumnOrder={firstListEntity?.kanban_column_order}
                  kanbanColumnLabels={firstListEntity?.kanban_column_labels}
                  kanbanCustomColumns={firstListEntity?.kanban_custom_columns ?? []}
                  canManageKanban={canManageStructure && Boolean(firstListId)}
                  spaceDiscussionId={activeSpaceView.spaceId}
                  spaceDiscussionName={activeSpaceView.spaceName}
                  onUpdateKanban={
                    firstListId
                      ? (payload) => patchKanbanForList(firstListId, payload)
                      : undefined
                  }
                  onCreateReminder={createReminder}
                  onCreateSubtask={createSubtask}
                  onSearchTasks={searchWorkspaceTasks}
                  onResolveRelatedTasks={resolveRelatedTasks}
                />
              );
            })()
          ) : (
            <KanbanBoard
              workspaceName={activeWorkspace?.name ?? 'Team Workspace'}
              spaceName={activeSpace?.name ?? 'No Space'}
              listName={activeListEntity?.name ?? 'Select List'}
              listTabs={activeSpaceLists.map((list) => ({ id: list.id, name: list.name }))}
              addTaskListOptions={addTaskDepartmentOptions}
              activeListId={activeList}
              onSelectList={handleSelectList}
              tasks={tasks}
              memberOptions={memberOptions}
              onCreateTask={(payload) => createTask(payload).catch((error) => console.error('Failed to create task', error))}
              onMoveTask={(taskId, status) => moveTask(taskId, status).catch((error) => console.error('Failed to move task', error))}
              onUpdateTask={(taskId, payload) =>
                updateTaskDetails(taskId, payload).catch((error) => {
                  console.error('Failed to update task', error);
                  return undefined;
                })
              }
              onDeleteTask={(taskId) => deleteTaskDetails(taskId).catch((error) => {
                console.error('Failed to delete task', error);
                toast.error(
                  error instanceof Error && error.message
                    ? `Task delete failed: ${error.message}`
                    : 'Task delete failed.'
                );
              })}
              canCreateTask={canCreateTasks && Boolean(activeList)}
              taskToOpenId={taskToOpenId}
              onConsumedTaskOpen={() => setTaskToOpenId(null)}
              kanbanColumnOrder={activeListEntity?.kanban_column_order}
              kanbanColumnLabels={activeListEntity?.kanban_column_labels}
              kanbanCustomColumns={activeListEntity?.kanban_custom_columns ?? []}
              canManageKanban={canManageStructure}
              onUpdateKanban={patchListKanban}
              onCreateReminder={createReminder}
              onCreateSubtask={createSubtask}
              onSearchTasks={searchWorkspaceTasks}
              onResolveRelatedTasks={resolveRelatedTasks}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
