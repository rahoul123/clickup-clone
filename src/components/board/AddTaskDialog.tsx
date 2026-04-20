import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronDown,
  ListTree,
  User,
  Calendar,
  MoreHorizontal,
  LayoutGrid,
  Paperclip,
  Bell,
  Search,
  Minimize2,
  BrainCircuit,
  ChevronUp,
  Check,
  Upload,
  Cloud,
  HardDrive,
  Box,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import type { TaskStatus, TaskPriority } from '@/types';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '@/types';
import { toast } from '@/hooks/use-toast';

const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

interface AddTaskDialogProps {
  status: string;
  /** When set, status dropdown uses these (e.g. list columns including custom). */
  statusOptions?: { value: string; label: string }[];
  /** Optional list selector shown at top-left (Landing Pages). */
  listOptions?: { id: string; name: string }[];
  activeListId?: string | null;
  onSelectList?: (listId: string) => void;
  onClose: () => void;
  memberOptions: { id: string; label: string }[];
  /** Logged-in user id — used to default reminder "For me" / "Notify me" actions. */
  currentUserId?: string;
  onCreate: (payload: {
    listId?: string;
    status: string;
    title: string;
    priority: TaskPriority;
    /** Task assignees (board / assignee field). */
    assigneeIds: string[];
    /** Bell: notify only — does not assign the task. */
    notifyOnlyUserIds?: string[];
    startDate?: string;
    endDate?: string;
    description?: string;
    /** Optional files picked via the Upload button; caller can persist them. */
    attachments?: File[];
  }) => void;
  /**
   * Create a real reminder (persisted server-side with scheduled notifications).
   * If omitted, the dialog falls back to creating a task tagged `[Reminder] …`.
   */
  onCreateReminder?: (payload: {
    title: string;
    description?: string;
    /** ISO string for the moment the reminder fires. */
    dueDate: string;
    /** User ids to notify in addition to the creator (who is always included). */
    notifyUserIds?: string[];
    /** Optional files selected via the paperclip button in the reminder composer. */
    attachments?: File[];
  }) => Promise<void> | void;
}

export function AddTaskDialog({
  status,
  statusOptions,
  listOptions = [],
  activeListId = null,
  onSelectList,
  onClose,
  onCreate,
  memberOptions,
  currentUserId,
  onCreateReminder,
}: AddTaskDialogProps) {
  const [activeTab, setActiveTab] = useState<'Task' | 'Doc' | 'Reminder' | 'Whiteboard' | 'Dashboard'>('Task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskStatus, setTaskStatus] = useState<string>(status);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [selectedListId, setSelectedListId] = useState<string>(activeListId ?? listOptions[0]?.id ?? '');
  const [docTitle, setDocTitle] = useState('');
  const [docBody, setDocBody] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderBody, setReminderBody] = useState('');
  const [reminderDate, setReminderDate] = useState(''); // yyyy-mm-dd
  const [reminderTime, setReminderTime] = useState('09:00'); // HH:mm
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [whiteboardTitle, setWhiteboardTitle] = useState('');
  const [dashboardTitle, setDashboardTitle] = useState('');
  const [isPrivateAsset, setIsPrivateAsset] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [notifyOnlyUserIds, setNotifyOnlyUserIds] = useState<string[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<'attach' | 'dueDate' | null>(null);
  const [notifyDropdownOpen, setNotifyDropdownOpen] = useState(false);
  const [bellMemberDropdownOpen, setBellMemberDropdownOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [reminderAttachments, setReminderAttachments] = useState<File[]>([]);
  const assigneeRef = useRef<HTMLDivElement | null>(null);
  const attachRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const reminderNotifyRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const reminderFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files) {
      const nextFiles = Array.from(files);
      const oversize = nextFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
      if (oversize) {
        toast({
          title: 'File too large',
          description: `${oversize.name} is larger than 4 MB.`,
        });
        e.currentTarget.value = '';
        return;
      }
      setAttachments((prev) => [...prev, ...nextFiles]);
    }
    e.currentTarget.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReminderFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files) {
      const nextFiles = Array.from(files);
      const oversize = nextFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
      if (oversize) {
        toast({
          title: 'File too large',
          description: `${oversize.name} is larger than 4 MB.`,
        });
        e.currentTarget.value = '';
        return;
      }
      setReminderAttachments((prev) => [...prev, ...nextFiles]);
    }
    e.currentTarget.value = '';
  };

  const removeReminderAttachment = (index: number) => {
    setReminderAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const triggerReminderFilePicker = () => {
    reminderFileInputRef.current?.click();
  };

  const triggerFilePicker = () => {
    setActiveDropdown(null);
    fileInputRef.current?.click();
  };

  const triggerImagePicker = () => {
    setActiveDropdown(null);
    imageInputRef.current?.click();
  };

  const notifyIntegrationPending = (service: string) => {
    setActiveDropdown(null);
    toast({
      title: `${service} integration coming soon`,
      description: 'For now please use "Upload file" to attach files from your device.',
    });
  };

  const filteredMembers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [assigneeSearch, memberOptions]);

  const visibleMembers = filteredMembers.length > 0 ? filteredMembers : memberOptions;

  useEffect(() => {
    setTaskStatus(status);
  }, [status]);

  useEffect(() => {
    if (activeListId) setSelectedListId(activeListId);
  }, [activeListId]);

  const statusSelectOptions = useMemo(() => {
    if (statusOptions && statusOptions.length > 0) return statusOptions;
    return (Object.keys(STATUS_CONFIG) as TaskStatus[]).map((s) => ({
      value: s,
      label: STATUS_CONFIG[s].label.toUpperCase(),
    }));
  }, [statusOptions]);

  useEffect(() => {
    if (!notifyDropdownOpen && !bellMemberDropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (notifyDropdownOpen && assigneeRef.current && !assigneeRef.current.contains(t)) {
        setNotifyDropdownOpen(false);
      }
      if (bellMemberDropdownOpen) {
        const insideTaskBell = bellRef.current?.contains(t);
        const insideReminderBell = reminderNotifyRef.current?.contains(t);
        if (!insideTaskBell && !insideReminderBell) {
          setBellMemberDropdownOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notifyDropdownOpen, bellMemberDropdownOpen]);

  const submitTask = () => {
    if (!title.trim()) return;
    onCreate({
      listId: selectedListId || undefined,
      status: taskStatus,
      title: title.trim(),
      priority,
      assigneeIds,
      notifyOnlyUserIds: notifyOnlyUserIds.length > 0 ? notifyOnlyUserIds : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  };

  const submitFromNonTaskTab = async () => {
    if (activeTab === 'Task') return;

    // Reminders are first-class entities now — persist them via the proper API
    // (which also schedules pre-day + due-day notifications on the server).
    if (activeTab === 'Reminder' && onCreateReminder) {
      const titleTrim = reminderTitle.trim();
      if (!titleTrim) {
        toast({ title: 'Reminder needs a name' });
        return;
      }
      if (!reminderDate) {
        toast({ title: 'Pick a date', description: 'Choose when this reminder should fire.' });
        return;
      }
      const timeStr = reminderTime && /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : '09:00';
      const [hh, mm] = timeStr.split(':').map((n) => Number(n));
      const [y, m, d] = reminderDate.split('-').map((n) => Number(n));
      const dueLocal = new Date(y, (m || 1) - 1, d || 1, hh || 9, mm || 0, 0, 0);
      if (Number.isNaN(dueLocal.getTime())) {
        toast({ title: 'Invalid reminder date' });
        return;
      }

      const notifyIds = Array.from(
        new Set([
          ...(currentUserId ? [currentUserId] : []),
          ...assigneeIds,
          ...notifyOnlyUserIds,
        ])
      );

      setReminderSubmitting(true);
      try {
        await onCreateReminder({
          title: titleTrim,
          description: reminderBody.trim() || undefined,
          dueDate: dueLocal.toISOString(),
          notifyUserIds: notifyIds.length > 0 ? notifyIds : undefined,
          attachments: reminderAttachments.length > 0 ? reminderAttachments : undefined,
        });
      } finally {
        setReminderSubmitting(false);
      }
      return;
    }

    const payloadByTab: Record<'Doc' | 'Reminder' | 'Whiteboard' | 'Dashboard', { title: string; description?: string }> = {
      Doc: { title: docTitle.trim(), description: docBody.trim() || undefined },
      Reminder: { title: reminderTitle.trim(), description: reminderBody.trim() || undefined },
      Whiteboard: { title: whiteboardTitle.trim() },
      Dashboard: { title: dashboardTitle.trim() },
    };
    const selected = payloadByTab[activeTab as 'Doc' | 'Reminder' | 'Whiteboard' | 'Dashboard'];
    if (!selected.title) return;
    onCreate({
      listId: selectedListId || undefined,
      status: taskStatus,
      title: `[${activeTab}] ${selected.title}`,
      description:
        `${selected.description ? `${selected.description}\n\n` : ''}Asset type: ${activeTab}${isPrivateAsset ? ' (Private)' : ''}`,
      priority,
      assigneeIds,
      notifyOnlyUserIds: notifyOnlyUserIds.length > 0 ? notifyOnlyUserIds : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const toggleAssigneeId = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleNotifyOnly = (id: string) => {
    setNotifyOnlyUserIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleDropdown = (name: 'attach' | 'dueDate') => {
    setActiveDropdown((prev) => (prev === name ? null : name));
    setNotifyDropdownOpen(false);
    setBellMemberDropdownOpen(false);
  };

  const colorByIndex = (idx: number) => {
    const colors = [
      'bg-indigo-500',
      'bg-blue-600',
      'bg-green-600',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-600',
      'bg-gray-700',
    ];
    return colors[idx % colors.length];
  };

  const assigneePickerContent = (
    <>
      <div className="p-3 border-b border-gray-50 dark:border-slate-800 flex items-center gap-2">
        <Search size={14} className="text-gray-400 dark:text-slate-500 shrink-0" />
        <input
          type="text"
          value={assigneeSearch}
          onChange={(e) => setAssigneeSearch(e.target.value)}
          placeholder="Search or enter email..."
          className="w-full text-[12px] outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {visibleMembers.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-gray-400 dark:text-slate-500">No users available</div>
        )}
        {visibleMembers.map((member, idx) => {
          const selected = assigneeIds.includes(member.id);
          return (
            <button
              type="button"
              key={member.id}
              onClick={() => toggleAssigneeId(member.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                selected ? 'bg-gray-100 dark:bg-slate-800' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 ${colorByIndex(
                    idx
                  )}`}
                >
                  {member.label.trim().charAt(0).toUpperCase() || 'U'}
                </span>
                <span className="text-[12px] text-gray-700 dark:text-slate-300 truncate">{member.label}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online" />
                {selected && <Check size={14} className="text-purple-600 dark:text-purple-400" />}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const bellPickerContent = (
    <>
      <div className="border-b border-gray-50 dark:border-slate-800 bg-blue-50/50 dark:bg-blue-950/30 px-3 py-2">
        <p className="text-[11px] font-medium text-blue-900">Notify only</p>
        <p className="text-[10px] leading-snug text-blue-800/80">
          Selected people get a notification — they are not assigned unless you also pick them under Assignee.
        </p>
      </div>
      <div className="p-3 border-b border-gray-50 dark:border-slate-800 flex items-center gap-2">
        <Search size={14} className="text-gray-400 dark:text-slate-500 shrink-0" />
        <input
          type="text"
          value={assigneeSearch}
          onChange={(e) => setAssigneeSearch(e.target.value)}
          placeholder="Search or enter email..."
          className="w-full text-[12px] outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {visibleMembers.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-gray-400 dark:text-slate-500">No users available</div>
        )}
        {visibleMembers.map((member, idx) => {
          const selected = notifyOnlyUserIds.includes(member.id);
          return (
            <button
              type="button"
              key={member.id}
              onClick={() => toggleNotifyOnly(member.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                selected ? 'bg-blue-50' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 ${colorByIndex(
                    idx
                  )}`}
                >
                  {member.label.trim().charAt(0).toUpperCase() || 'U'}
                </span>
                <span className="text-[12px] text-gray-700 dark:text-slate-300 truncate">{member.label}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online" />
                {selected && <Check size={14} className="text-blue-600" />}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 font-sans antialiased" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-[680px] rounded-xl shadow-2xl dark:shadow-black/60 ring-1 ring-black/5 dark:ring-white/10 flex flex-col relative overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 border-b border-gray-100 dark:border-slate-800/80">
          <div className="flex gap-6">
            {(['Task', 'Doc', 'Reminder', 'Whiteboard', 'Dashboard'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3.5 text-[13px] font-medium transition-all relative ${
                  activeTab === tab ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'
                }`}
              >
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-600 rounded-full" />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-gray-400 dark:text-slate-500">
            <Minimize2 size={15} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300 rotate-90" />
            <X size={18} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300" onClick={onClose} />
          </div>
        </div>

        {activeTab === 'Task' ? (
          <>
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded text-[12px] text-gray-600 dark:text-slate-300">
                  <ListTree size={14} className="text-purple-500" />
                  <select
                    value={selectedListId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSelectedListId(next);
                      onSelectList?.(next);
                    }}
                    className="bg-transparent outline-none"
                  >
                    {(listOptions.length > 0 ? listOptions : [{ id: '', name: 'Department' }]).map((opt) => (
                      <option key={opt.id || 'default'} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-gray-400 dark:text-slate-500" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded text-[12px] text-gray-600 dark:text-slate-300">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 dark:border-slate-500" />
                  <select
                    value={activeTab}
                    onChange={(e) =>
                      setActiveTab(e.target.value as 'Task' | 'Doc' | 'Reminder' | 'Whiteboard' | 'Dashboard')
                    }
                    className="bg-transparent outline-none"
                  >
                    <option value="Task">Task</option>
                    <option value="Doc">Doc</option>
                    <option value="Reminder">Reminder</option>
                    <option value="Whiteboard">Whiteboard</option>
                    <option value="Dashboard">Dashboard</option>
                  </select>
                  <ChevronDown size={14} className="text-gray-400 dark:text-slate-500" />
                </div>
              </div>

              <div className="space-y-3 mb-8">
                <input
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task Name"
                  className="w-full bg-transparent text-2xl font-semibold text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-600 border-none p-0 focus:ring-0 caret-purple-500"
                />
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description, or write with AI"
                  className="w-full bg-transparent text-[14px] text-gray-700 dark:text-slate-300 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 border-none p-0 focus:ring-0"
                />
                <div className="flex items-center gap-1 text-[13px] text-gray-400 dark:text-slate-500">
                  <span>Write with</span>
                  <BrainCircuit size={16} className="text-gray-400 dark:text-slate-500" />
                  <span>AI</span>
                </div>
              </div>

              <div className="flex items-center gap-2 relative">
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value)}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded text-[11px] font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  {statusSelectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div className="relative" ref={assigneeRef}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setNotifyDropdownOpen((prev) => !prev);
                      setBellMemberDropdownOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setNotifyDropdownOpen((prev) => !prev);
                        setBellMemberDropdownOpen(false);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border border-dashed rounded text-[12px] transition-all cursor-pointer ${
                      notifyDropdownOpen ? 'bg-gray-50 dark:bg-slate-800/70 border-gray-400 dark:border-slate-500 text-gray-700 dark:text-slate-200' : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <User size={14} />
                    <span>Assignee</span>
                    <ChevronDown size={12} className="text-gray-400 dark:text-slate-500" />
                    {assigneeIds.length > 0 && (
                      <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                        {assigneeIds.length}
                      </span>
                    )}
                  </div>

                  {notifyDropdownOpen && (
                    <div className="absolute top-10 left-0 w-64 bg-white dark:bg-slate-900 shadow-2xl border border-gray-100 dark:border-slate-800 rounded-xl z-[70]">
                      {assigneePickerContent}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown('dueDate')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed rounded text-[12px] ${
                      activeDropdown === 'dueDate' ? 'bg-gray-50 dark:bg-slate-800/70 border-gray-400 dark:border-slate-500 text-gray-700 dark:text-slate-200' : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <Calendar size={14} /> {endDate ? new Date(endDate).toLocaleDateString() : 'Due date'}
                  </button>
                  {activeDropdown === 'dueDate' && (
                    <div className="absolute top-10 left-0 z-[70] w-56 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-3">
                      <div className="text-[11px] font-semibold text-gray-600 dark:text-slate-400 mb-2">Select due date</div>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setActiveDropdown(null);
                        }}
                        className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 px-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEndDate('');
                          setActiveDropdown(null);
                        }}
                        className="mt-2 text-[11px] text-gray-500 dark:text-slate-400 hover:text-gray-700"
                      >
                        Clear date
                      </button>
                    </div>
                  )}
                </div>

                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 rounded text-[12px] hover:bg-gray-50 dark:hover:bg-slate-800/70"
                >
                  {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_CONFIG[p].label}
                    </option>
                  ))}
                </select>

                <button type="button" className="p-1.5 border border-dashed border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400 rounded hover:bg-gray-50 dark:hover:bg-slate-800/70">
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>

            {attachments.length > 0 && (
              <div className="px-6 pb-3 -mt-1 flex flex-wrap gap-2">
                {attachments.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="group inline-flex items-center gap-1.5 max-w-[220px] rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/70 px-2 py-1 text-[11px] text-gray-700 dark:text-slate-200"
                    title={`${file.name} — ${(file.size / 1024).toFixed(1)} KB`}
                  >
                    {file.type.startsWith('image/') ? (
                      <ImageIcon size={12} className="text-purple-500 shrink-0" />
                    ) : (
                      <FileText size={12} className="text-blue-500 shrink-0" />
                    )}
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="shrink-0 rounded p-0.5 text-gray-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 p-4 border-t border-gray-100 dark:border-slate-800/80 bg-gray-50/50 dark:bg-slate-950/40 flex items-center justify-between rounded-b-xl">
              <button type="button" className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded text-[12px] font-semibold text-gray-600 dark:text-slate-400 hover:shadow-sm dark:hover:shadow-black/40">
                <LayoutGrid size={14} className="text-purple-500" />
                Templates
              </button>

              <div className="flex items-center gap-5">
                <div className="flex items-center gap-3.5 text-gray-400 dark:text-slate-500 relative">
                  <div className="relative" ref={attachRef}>
                    <button
                      type="button"
                      onClick={() => toggleDropdown('attach')}
                      className={`relative flex items-center hover:text-gray-600 dark:hover:text-slate-300 ${activeDropdown === 'attach' || attachments.length > 0 ? 'text-purple-600 dark:text-purple-400' : ''}`}
                      aria-label="Attach files"
                    >
                      <Paperclip size={18} />
                      {attachments.length > 0 && (
                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {attachments.length}
                        </span>
                      )}
                    </button>
                    {activeDropdown === 'attach' && (
                      <div className="absolute bottom-full mb-3 left-[-150px] w-52 bg-white dark:bg-slate-900 shadow-2xl border border-gray-100 dark:border-slate-800 rounded-xl z-[70] py-1">
                        {([
                          { name: 'Upload file', icon: <Upload size={14} />, onClick: triggerFilePicker },
                          { name: 'Upload image', icon: <ImageIcon size={14} className="text-purple-500" />, onClick: triggerImagePicker },
                          { name: 'Dropbox', icon: <Cloud size={14} className="text-blue-500" />, onClick: () => notifyIntegrationPending('Dropbox') },
                          { name: 'OneDrive/SharePoint', icon: <Cloud size={14} className="text-blue-600" />, onClick: () => notifyIntegrationPending('OneDrive/SharePoint') },
                          { name: 'Box', icon: <Box size={14} className="text-blue-400" />, onClick: () => notifyIntegrationPending('Box') },
                          { name: 'Google Drive', icon: <HardDrive size={14} className="text-green-600" />, onClick: () => notifyIntegrationPending('Google Drive') },
                          { name: 'New Google Doc', icon: <FileText size={14} className="text-blue-500" />, onClick: () => notifyIntegrationPending('Google Docs') },
                        ] as const).map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 text-[12px] text-gray-700 dark:text-slate-300 transition text-left"
                            onClick={opt.onClick}
                          >
                            {opt.icon} <span>{opt.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <input
                      ref={imageInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                  <div className="relative" ref={bellRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setBellMemberDropdownOpen((prev) => !prev);
                        setNotifyDropdownOpen(false);
                        setActiveDropdown(null);
                      }}
                      className={`flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors ${
                        bellMemberDropdownOpen
                          ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-500/40'
                          : 'cursor-pointer bg-gray-100 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800 hover:text-gray-800 dark:hover:text-slate-100'
                      }`}
                      title="Notify only (voucher) — not assignee"
                    >
                      <Bell size={17} className="shrink-0" />
                      <span className="min-w-[1.25rem] rounded bg-blue-600 px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
                        {notifyOnlyUserIds.length}
                      </span>
                    </button>
                    {bellMemberDropdownOpen && (
                      <div className="absolute bottom-full right-0 z-[70] mb-2 w-[min(calc(100vw-2rem),18rem)] overflow-hidden rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
                        {bellPickerContent}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center shadow-md shadow-purple-200">
                  <button
                    type="button"
                    onClick={submitTask}
                    className="bg-[#7C4DFF] text-white px-4 py-2 rounded-l text-[13px] font-bold hover:bg-[#6b3deb] transition"
                  >
                    Create Task
                  </button>
                  <div className="w-[1px] h-9 bg-purple-400/30" />
                  <button type="button" className="bg-[#7C4DFF] text-white px-2 py-2 rounded-r hover:bg-[#6b3deb] transition">
                    <ChevronUp size={16} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[420px] flex-col">
            <div className="flex-1 p-6">
              {(activeTab === 'Doc' || activeTab === 'Whiteboard' || activeTab === 'Dashboard') && (
                <div className="mb-4 inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[12px] text-gray-600 dark:text-slate-400">
                  <ListTree size={14} className="text-gray-500 dark:text-slate-400" />
                  <span>
                    {activeTab === 'Doc'
                      ? 'Add to location'
                      : activeTab === 'Whiteboard'
                        ? 'My Whiteboards'
                        : 'My Dashboards'}
                  </span>
                  <ChevronDown size={14} className="text-gray-400 dark:text-slate-500" />
                </div>
              )}

              {activeTab === 'Doc' && (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Name this Doc..."
                    className="w-full bg-transparent text-3xl font-semibold text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 caret-purple-500"
                  />
                  <input
                    type="text"
                    value={docBody}
                    onChange={(e) => setDocBody(e.target.value)}
                    placeholder="Start writing"
                    className="w-full bg-transparent text-lg text-gray-700 dark:text-slate-300 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                  <button type="button" className="text-[14px] text-gray-500 dark:text-slate-400 hover:text-gray-700">
                    Write with AI
                  </button>
                  <div className="pt-2">
                    <p className="mb-2 text-[14px] text-gray-500 dark:text-slate-400">Add new</p>
                    <div className="space-y-2 text-[15px] text-gray-600 dark:text-slate-400">
                      <div className="flex items-center gap-2"><LayoutGrid size={15} /> Table</div>
                      <div className="flex items-center gap-2"><ListTree size={15} /> Column</div>
                      <div className="flex items-center gap-2"><ListTree size={15} /> ClickUp List</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Reminder' && (
                <div className="space-y-5">
                  <input
                    type="text"
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    placeholder="Reminder name or type '/' for commands"
                    className="w-full bg-transparent text-3xl font-semibold text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 caret-purple-500"
                  />
                  <input
                    type="text"
                    value={reminderBody}
                    onChange={(e) => setReminderBody(e.target.value)}
                    placeholder="Add description"
                    className="w-full bg-transparent text-lg text-gray-700 dark:text-slate-300 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />

                  <div className="grid grid-cols-[auto_auto_1fr] items-center gap-3 pt-1">
                    <label className="text-[12px] font-medium text-gray-500 dark:text-slate-400">When</label>
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-2 text-[13px] text-gray-700 dark:text-slate-200 outline-none focus:border-purple-500"
                    />
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="h-9 w-28 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-2 text-[13px] text-gray-700 dark:text-slate-200 outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date();
                        const y = today.getFullYear();
                        const m = String(today.getMonth() + 1).padStart(2, '0');
                        const d = String(today.getDate()).padStart(2, '0');
                        setReminderDate(`${y}-${m}-${d}`);
                      }}
                      className="rounded border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const t = new Date();
                        t.setDate(t.getDate() + 1);
                        const y = t.getFullYear();
                        const m = String(t.getMonth() + 1).padStart(2, '0');
                        const d = String(t.getDate()).padStart(2, '0');
                        setReminderDate(`${y}-${m}-${d}`);
                      }}
                      className="rounded border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentUserId) {
                          setAssigneeIds((prev) => (prev.includes(currentUserId) ? prev : [...prev, currentUserId]));
                        }
                      }}
                      className="rounded border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                      For me
                    </button>
                    <div className="relative" ref={reminderNotifyRef}>
                      <button
                        type="button"
                        onClick={() => setBellMemberDropdownOpen((prev) => !prev)}
                        className={`rounded border px-2.5 py-1.5 text-[12px] transition-colors ${
                          bellMemberDropdownOpen
                            ? 'border-blue-300 dark:border-blue-500/60 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        Notify others…
                        {notifyOnlyUserIds.length > 0 && (
                          <span className="ml-1.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {notifyOnlyUserIds.length}
                          </span>
                        )}
                      </button>
                      {bellMemberDropdownOpen && (
                        <div className="absolute left-0 top-full z-[70] mt-2 w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
                          {bellPickerContent}
                        </div>
                      )}
                    </div>
                  </div>

                  {(assigneeIds.length > 0 || notifyOnlyUserIds.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600 dark:text-slate-400">
                      <span className="font-medium">Notify:</span>
                      {[...new Set([...assigneeIds, ...notifyOnlyUserIds])].map((id) => {
                        const member = memberOptions.find((m) => m.id === id);
                        if (!member) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-full border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 text-purple-700 dark:text-purple-300"
                          >
                            {member.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {reminderAttachments.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[12px] font-medium text-gray-500 dark:text-slate-400">
                        Attachments ({reminderAttachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {reminderAttachments.map((file, idx) => (
                          <div
                            key={`${file.name}-${idx}`}
                            className="group inline-flex max-w-full items-center gap-2 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-slate-200"
                          >
                            <Paperclip size={12} className="flex-shrink-0 text-gray-400 dark:text-slate-500" />
                            <span className="truncate" title={file.name}>
                              {file.name}
                            </span>
                            <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-slate-500">
                              {(file.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              type="button"
                              onClick={() => removeReminderAttachment(idx)}
                              className="ml-1 flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                              title="Remove"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 dark:text-slate-500">
                    We'll send a heads-up notification <span className="font-medium">one day before</span> and again on the <span className="font-medium">reminder date</span>.
                  </p>
                </div>
              )}

              {activeTab === 'Whiteboard' && (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={whiteboardTitle}
                    onChange={(e) => setWhiteboardTitle(e.target.value)}
                    placeholder="Name this Whiteboard..."
                    className="w-full bg-transparent text-3xl font-semibold text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 caret-purple-500"
                  />
                </div>
              )}

              {activeTab === 'Dashboard' && (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={dashboardTitle}
                    onChange={(e) => setDashboardTitle(e.target.value)}
                    placeholder="Name this Dashboard..."
                    className="w-full bg-transparent text-3xl font-semibold text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 caret-purple-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-800/80 bg-gray-50/50 dark:bg-slate-950/40 px-6 py-4 rounded-b-xl">
              <label className="inline-flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={isPrivateAsset}
                  onChange={(e) => setIsPrivateAsset(e.target.checked)}
                />
                Private
              </label>
              <div className="flex items-center gap-4">
                {activeTab === 'Reminder' && (
                  <>
                    <input
                      ref={reminderFileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={handleReminderFileSelect}
                    />
                    <button
                      type="button"
                      onClick={triggerReminderFilePicker}
                      title={
                        reminderAttachments.length > 0
                          ? `${reminderAttachments.length} file${reminderAttachments.length > 1 ? 's' : ''} attached`
                          : 'Attach files to this reminder'
                      }
                      className={`relative inline-flex items-center justify-center rounded-md p-2 transition-colors ${
                        reminderAttachments.length > 0
                          ? 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10'
                          : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <Paperclip size={16} />
                      {reminderAttachments.length > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold leading-none text-white">
                          {reminderAttachments.length}
                        </span>
                      )}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={submitFromNonTaskTab}
                  disabled={activeTab === 'Reminder' && reminderSubmitting}
                  className="rounded bg-[#7C4DFF] px-5 py-2 text-[14px] font-bold text-white hover:bg-[#6b3deb] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {activeTab === 'Reminder' && reminderSubmitting ? 'Creating…' : `Create ${activeTab}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
