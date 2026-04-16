import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, UserCircle2, ChevronDown } from 'lucide-react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ExportReportDialog } from '@/components/layout/ExportReportDialog';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { HomeInbox } from '@/components/home/HomeInbox';
import { ModernDashboard } from '@/components/dashboard/ModernDashboard';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
import { TeamMembersPage } from '@/components/team/TeamMembersPage';
import { DocsPage } from '@/components/docs/DocsPage';
import { TimesheetsPage } from '@/components/timesheets/TimesheetsPage';
import { useAuth } from '@/contexts/AuthContext';
import type {
  AppRole,
  DashboardAnalytics,
  HomeTask,
  List,
  Notification as AppNotification,
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
    'home' | 'board' | 'dashboard' | 'notifications' | 'team-members' | 'docs' | 'timesheets'
  >('board');
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
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedNotificationsRef = useRef(false);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeListEntity = lists.find((list) => list.id === activeList) ?? null;
  const activeSpace = activeListEntity ? spaces.find((space) => space.id === activeListEntity.space_id) ?? null : null;
  const activeSpaceLists = activeSpace ? lists.filter((list) => list.space_id === activeSpace.id) : [];

  const activeRole: AppRole = activeWorkspaceId
    ? rolesByWorkspaceId[activeWorkspaceId] ?? 'employee'
    : 'employee';

  const normalizeDept = (val?: string | null) => String(val || '').toLowerCase().replace(/\s+/g, '').trim();

  const workspaceSections = useMemo(() => {
    const myDept = normalizeDept(user?.department);
    const isMyDepartmentSpace = (space: Space) => {
      if (!myDept) return true;
      const depNorm = normalizeDept(space.department);
      if (depNorm) return depNorm === myDept;
      const nameNorm = normalizeDept(space.name);
      return Boolean(nameNorm && (nameNorm.includes(myDept) || myDept.includes(nameNorm)));
    };
    return workspaces.map((ws) => {
      const wsRole = rolesByWorkspaceId[ws.id] ?? 'employee';
      const canSeeAllDeptLists = wsRole === 'admin';
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
              children: departments.map((space) => ({
                id: space.id,
                name: space.name,
                color: space.color,
                noExpand:
                  !canSeeAllDeptLists &&
                  Boolean(myDept) &&
                  !isMyDepartmentSpace(space),
                lists:
                  !canSeeAllDeptLists &&
                  Boolean(myDept) &&
                  !isMyDepartmentSpace(space)
                    ? lists
                        .filter((l) => l.space_id === space.id)
                        .slice(0, 1)
                        .map((l) => ({ id: l.id, name: l.name }))
                    : lists.filter((l) => l.space_id === space.id).map((l) => ({ id: l.id, name: l.name })),
              })),
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
          lists: lists.filter((l) => l.space_id === space.id).map((l) => ({ id: l.id, name: l.name })),
        })),
      };
    });
  }, [workspaces, spaces, lists, rolesByWorkspaceId, user?.department]);

  const addTaskDepartmentOptions = useMemo(() => {
    if (!activeWorkspaceId) return [] as Array<{ id: string; name: string }>;
    const section = workspaceSections.find((s) => s.id === activeWorkspaceId);
    const master = section?.spaces.find((s) => s.isMasterFolder);
    if (!master?.children) return [] as Array<{ id: string; name: string }>;
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
  const canInviteMembers = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'team_lead';
  const canCreateSpaces = activeRole === 'admin';
  const canManageStructure = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'team_lead';
  const canDeleteSpaces = activeRole === 'admin' || activeRole === 'manager';
  const canCreateTasks = activeRole !== 'guest';
  const userDisplayLabel = user?.displayName?.trim() || user?.email || 'User';
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

  useEffect(() => {
    if (!user || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

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
      toast.error('Task open nahi ho saka. Shayad access issue hai.');
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
      window.alert('Sirf admin space create kar sakta hai.');
      return;
    }
    const suggestedDepartment = activeWorkspace?.department ?? user.department ?? '';
    const department = window.prompt('Department for this team space', suggestedDepartment)?.trim();
    if (!department) return;
    const { space: data } = await api.app.createSpace(activeWorkspaceId, name, department);
    setSpaces((prev) => [...prev, data]);
  };

  const createList = async (spaceId: string, name: string) => {
    if (!user) return;
    if (!canManageStructure) {
      window.alert('Aapke role me list create karne ki permission nahi hai.');
      return;
    }
    const { list: data } = await api.app.createList(spaceId, name);
    setLists((prev) => [...prev, data]);
    setActiveList(data.id);
    setTasks([]);
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
    if (!canManageStructure) {
      window.alert('Aapke role me list delete karne ki permission nahi hai.');
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
      window.alert('Sirf admin/team lead/manager invite kar sakte hain.');
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
  }) => {
    const targetListId = payload.listId || activeList;
    if (!user || !targetListId) return;
    if (!canCreateTasks) {
      window.alert('Guest role task create nahi kar sakta.');
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
    setTasks((prev) => [
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
      },
      ...prev,
    ]);
    toast.success(`Task "${data.title}" created.`);

    hydrateTasks(targetListId).catch((refreshError) => console.error('Task refresh failed after create', refreshError));
  };

  const moveTask = async (taskId: string, nextStatus: string) => {
    if (!canCreateTasks) {
      window.alert('Aapke role me drag-drop permission nahi hai.');
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
    };
    setTasks((prev) => prev.map((item) => (item.id === taskId ? normalized : item)));
    if (payload.status && previousStatus && payload.status !== previousStatus) {
      toast.success(`"${normalized.title}" moved to ${formatStatusLabel(payload.status)}.`);
    }
    return normalized;
  };

  const deleteTaskDetails = async (taskId: string) => {
    await api.app.deleteTask(taskId);
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
    if (taskToOpenId === taskId) setTaskToOpenId(null);
    toast.success('Task deleted successfully.');
  };

  const patchListKanban = useCallback(
    async (payload: {
      kanbanColumnOrder?: string[];
      kanbanColumnLabels?: Partial<Record<string, string>>;
      addKanbanColumn?: { label: string; color?: string };
      updateKanbanCustomColumn?: { id: string; label: string; color?: string };
      deleteKanbanCustomColumn?: { id: string };
      deleteKanbanColumn?: { id: string };
    }) => {
      if (!activeList) return;
      try {
        const { list } = await api.app.updateListKanban(activeList, {
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
    [activeList]
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
        onCreateList={(spaceId, name) => createList(spaceId, name).catch((error) => console.error('Failed to create list', error))}
        onDeleteSpace={(spaceId, spaceName) =>
          deleteSpace(spaceId, spaceName).catch((error) => console.error('Failed to delete space', error))
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
        <div className="z-40 flex h-12 shrink-0 items-center justify-end border-b border-border/70 bg-background/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2 py-1 shadow-sm">
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
              onRefresh={() => fetchHomeTasks().catch((error) => console.error('Failed to refresh home', error))}
              onOpenTask={openTaskFromHome}
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
                toast.error('Task delete failed.');
              })}
              canCreateTask={canCreateTasks && Boolean(activeList)}
              taskToOpenId={taskToOpenId}
              onConsumedTaskOpen={() => setTaskToOpenId(null)}
              kanbanColumnOrder={activeListEntity?.kanban_column_order}
              kanbanColumnLabels={activeListEntity?.kanban_column_labels}
              kanbanCustomColumns={activeListEntity?.kanban_custom_columns ?? []}
              canManageKanban={canManageStructure}
              onUpdateKanban={patchListKanban}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
