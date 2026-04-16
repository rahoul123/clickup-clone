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
} from 'lucide-react';
import type { TaskStatus, TaskPriority } from '@/types';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '@/types';

interface AddTaskDialogProps {
  status: string;
  /** When set, status dropdown uses these (e.g. list columns including custom). */
  statusOptions?: { value: string; label: string }[];
  onClose: () => void;
  memberOptions: { id: string; label: string }[];
  onCreate: (payload: {
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
  }) => void;
}

export function AddTaskDialog({
  status,
  statusOptions,
  onClose,
  onCreate,
  memberOptions,
}: AddTaskDialogProps) {
  const [activeTab, setActiveTab] = useState<'Task' | 'Doc' | 'Reminder' | 'Whiteboard' | 'Dashboard'>('Task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskStatus, setTaskStatus] = useState<string>(status);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [notifyOnlyUserIds, setNotifyOnlyUserIds] = useState<string[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<'attach' | 'dueDate' | null>(null);
  const [notifyDropdownOpen, setNotifyDropdownOpen] = useState(false);
  const [bellMemberDropdownOpen, setBellMemberDropdownOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const assigneeRef = useRef<HTMLDivElement | null>(null);
  const attachRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLDivElement | null>(null);

  const filteredMembers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [assigneeSearch, memberOptions]);

  const visibleMembers = filteredMembers.length > 0 ? filteredMembers : memberOptions;

  useEffect(() => {
    setTaskStatus(status);
  }, [status]);

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
      if (bellMemberDropdownOpen && bellRef.current && !bellRef.current.contains(t)) {
        setBellMemberDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notifyDropdownOpen, bellMemberDropdownOpen]);

  const submitTask = () => {
    if (!title.trim()) return;
    onCreate({
      status: taskStatus,
      title: title.trim(),
      priority,
      assigneeIds,
      notifyOnlyUserIds: notifyOnlyUserIds.length > 0 ? notifyOnlyUserIds : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
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
      <div className="p-3 border-b border-gray-50 flex items-center gap-2">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={assigneeSearch}
          onChange={(e) => setAssigneeSearch(e.target.value)}
          placeholder="Search or enter email..."
          className="w-full text-[12px] outline-none placeholder:text-gray-400"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {visibleMembers.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-gray-400">No users available</div>
        )}
        {visibleMembers.map((member, idx) => {
          const selected = assigneeIds.includes(member.id);
          return (
            <button
              type="button"
              key={member.id}
              onClick={() => toggleAssigneeId(member.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                selected ? 'bg-gray-100' : 'hover:bg-gray-50'
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
                <span className="text-[12px] text-gray-700 truncate">{member.label}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online" />
                {selected && <Check size={14} className="text-purple-600" />}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const bellPickerContent = (
    <>
      <div className="border-b border-gray-50 bg-blue-50/50 px-3 py-2">
        <p className="text-[11px] font-medium text-blue-900">Notify only</p>
        <p className="text-[10px] leading-snug text-blue-800/80">
          Selected people get a notification — they are not assigned unless you also pick them under Assignee.
        </p>
      </div>
      <div className="p-3 border-b border-gray-50 flex items-center gap-2">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={assigneeSearch}
          onChange={(e) => setAssigneeSearch(e.target.value)}
          placeholder="Search or enter email..."
          className="w-full text-[12px] outline-none placeholder:text-gray-400"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {visibleMembers.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-gray-400">No users available</div>
        )}
        {visibleMembers.map((member, idx) => {
          const selected = notifyOnlyUserIds.includes(member.id);
          return (
            <button
              type="button"
              key={member.id}
              onClick={() => toggleNotifyOnly(member.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                selected ? 'bg-blue-50' : 'hover:bg-gray-50'
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
                <span className="text-[12px] text-gray-700 truncate">{member.label}</span>
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans antialiased" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[680px] rounded-xl shadow-2xl flex flex-col relative overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 border-b border-gray-100">
          <div className="flex gap-6">
            {(['Task', 'Doc', 'Reminder', 'Whiteboard', 'Dashboard'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3.5 text-[13px] font-medium transition-all relative ${
                  activeTab === tab ? 'text-purple-600' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-600 rounded-full" />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-gray-400">
            <Minimize2 size={15} className="cursor-pointer hover:text-gray-600 rotate-90" />
            <X size={18} className="cursor-pointer hover:text-gray-600" onClick={onClose} />
          </div>
        </div>

        {activeTab === 'Task' ? (
          <>
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded text-[12px] text-gray-600">
                  <ListTree size={14} className="text-purple-500" />
                  <span>Landing Pages</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded text-[12px] text-gray-600">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400" />
                  <span>Task</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <input
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task Name"
                  className="w-full text-2xl font-semibold text-gray-800 outline-none placeholder:text-gray-300 border-none p-0 focus:ring-0"
                />
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description, or write with AI"
                  className="w-full text-[14px] text-gray-500 outline-none border-none p-0 focus:ring-0"
                />
                <div className="flex items-center gap-1 text-[14px] text-gray-400">
                  <span>Write with</span>
                  <BrainCircuit size={16} className="text-gray-400" />
                  <span>AI</span>
                </div>
              </div>

              <div className="flex items-center gap-2 relative">
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-200 rounded text-[11px] font-bold text-gray-600 hover:bg-gray-50"
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
                      notifyDropdownOpen ? 'bg-gray-50 border-gray-400 text-gray-700' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <User size={14} />
                    <span>Assignee</span>
                    <ChevronDown size={12} className="text-gray-400" />
                    {assigneeIds.length > 0 && (
                      <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                        {assigneeIds.length}
                      </span>
                    )}
                  </div>

                  {notifyDropdownOpen && (
                    <div className="absolute top-10 left-0 w-64 bg-white shadow-2xl border border-gray-100 rounded-xl z-[70]">
                      {assigneePickerContent}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleDropdown('dueDate')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed rounded text-[12px] ${
                      activeDropdown === 'dueDate' ? 'bg-gray-50 border-gray-400 text-gray-700' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Calendar size={14} /> {endDate ? new Date(endDate).toLocaleDateString() : 'Due date'}
                  </button>
                  {activeDropdown === 'dueDate' && (
                    <div className="absolute top-10 left-0 z-[70] w-56 rounded-xl border border-gray-100 bg-white shadow-2xl p-3">
                      <div className="text-[11px] font-semibold text-gray-600 mb-2">Select due date</div>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setActiveDropdown(null);
                        }}
                        className="w-full h-9 rounded-md border border-gray-200 px-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEndDate('');
                          setActiveDropdown(null);
                        }}
                        className="mt-2 text-[11px] text-gray-500 hover:text-gray-700"
                      >
                        Clear date
                      </button>
                    </div>
                  )}
                </div>

                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed text-gray-500 rounded text-[12px] hover:bg-gray-50"
                >
                  {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_CONFIG[p].label}
                    </option>
                  ))}
                </select>

                <button type="button" className="p-1.5 border border-dashed text-gray-400 rounded hover:bg-gray-50">
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>

            <div className="mt-4 p-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between rounded-b-xl">
              <button type="button" className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 bg-white rounded text-[12px] font-semibold text-gray-600 hover:shadow-sm">
                <LayoutGrid size={14} className="text-purple-500" />
                Templates
              </button>

              <div className="flex items-center gap-5">
                <div className="flex items-center gap-3.5 text-gray-400 relative">
                  <div className="relative" ref={attachRef}>
                    <Paperclip
                      size={18}
                      className={`cursor-pointer hover:text-gray-600 ${activeDropdown === 'attach' ? 'text-purple-600' : ''}`}
                      onClick={() => toggleDropdown('attach')}
                    />
                    {activeDropdown === 'attach' && (
                      <div className="absolute bottom-full mb-3 left-[-150px] w-52 bg-white shadow-2xl border border-gray-100 rounded-xl z-[70] py-1">
                        {[
                          { name: 'Upload file', icon: <Upload size={14} /> },
                          { name: 'Dropbox', icon: <Cloud size={14} className="text-blue-500" /> },
                          { name: 'OneDrive/SharePoint', icon: <Cloud size={14} className="text-blue-600" /> },
                          { name: 'Box', icon: <Box size={14} className="text-blue-400" /> },
                          { name: 'Google Drive', icon: <HardDrive size={14} className="text-green-600" /> },
                          { name: 'New Google Doc', icon: <FileText size={14} className="text-blue-500" /> },
                        ].map((opt) => (
                          <button
                            key={opt.name}
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-[12px] text-gray-700 transition text-left"
                            onClick={() => setActiveDropdown(null)}
                          >
                            {opt.icon} <span>{opt.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
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
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'cursor-pointer bg-gray-100/80 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                      title="Notify only (voucher) — not assignee"
                    >
                      <Bell size={17} className="shrink-0" />
                      <span className="min-w-[1.25rem] rounded bg-blue-600 px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
                        {notifyOnlyUserIds.length}
                      </span>
                    </button>
                    {bellMemberDropdownOpen && (
                      <div className="absolute bottom-full right-0 z-[70] mb-2 w-[min(calc(100vw-2rem),18rem)] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl">
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
          <div className="p-6 min-h-[260px] flex flex-col justify-between">
            <div className="text-sm text-gray-500">
              {activeTab === 'Doc' && 'Create Doc'}
              {activeTab === 'Reminder' && 'Create Reminder'}
              {activeTab === 'Whiteboard' && 'Create Whiteboard'}
              {activeTab === 'Dashboard' && 'Create Dashboard'}
            </div>
            <button className="self-end h-8 px-4 bg-purple-600 text-white rounded text-xs font-semibold">
              Create {activeTab}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
