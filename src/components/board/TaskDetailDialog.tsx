import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import {
  X, Maximize2, MoreHorizontal, Settings, Share2,
  MessageSquare, User, Calendar, Flag, Clock,
  Tag, ChevronRight, Plus, ListChecks, Link, Paperclip,
  Smile, AtSign, Video, Mic, Image as ImageIcon, Send, BrainCircuit, Check, Search,
  Copy, Lock, Globe, Upload, FileText, Download, Play, Save
} from 'lucide-react';
import type { Task, TaskPriority, TaskStatus, CommentAttachment } from '@/types';

interface TaskCommentView {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  attachments?: CommentAttachment[];
  created_at: string;
  author_name?: string;
  /** Users (other than author) who opened the task and saw this comment */
  read_by?: Array<{ user_id: string; name?: string; read_at?: string }>;
}

interface TaskDetailDialogProps {
  task: Task;
  memberOptions: { id: string; label: string }[];
  comments: TaskCommentView[];
  loadingComments: boolean;
  onClose: () => void;
  onSendComment: (content: string, attachments?: CommentAttachment[]) => Promise<void>;
  onUpdateTask: (payload: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeIds?: string[];
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
}

export function TaskDetailDialog({
  task,
  memberOptions,
  comments,
  loadingComments,
  onClose,
  onSendComment,
  onUpdateTask,
}: TaskDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<'task' | 'doc' | 'reminder' | 'whiteboard' | 'dashboard'>('task');
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [startDate, setStartDate] = useState(task.start_date ? task.start_date.slice(0, 10) : '');
  const [endDate, setEndDate] = useState(task.due_date ? task.due_date.slice(0, 10) : '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assignee_ids);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [activePopup, setActivePopup] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement | null>(null);

  const filteredMembers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [assigneeSearch, memberOptions]);

  const saveDebounceRef = useRef<number | null>(null);
  const skipAutoSaveRef = useRef(false);
  const MAX_ATTACHMENT_SIZE_BYTES = 4 * 1024 * 1024;

  useEffect(() => {
    skipAutoSaveRef.current = true;
    setTitle(task.title);
    setDescription(task.description || '');
    setStatus(task.status);
    setPriority(task.priority);
    setStartDate(task.start_date ? task.start_date.slice(0, 10) : '');
    setEndDate(task.due_date ? task.due_date.slice(0, 10) : '');
    setAssigneeIds(task.assignee_ids);
    setAttachments([]);
    const timer = window.setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [task]);

  useEffect(() => {
    if (skipAutoSaveRef.current) return;

    const isSameAsOriginal =
      title === task.title &&
      description === (task.description ?? '') &&
      status === task.status &&
      priority === task.priority &&
      startDate === (task.start_date ? task.start_date.slice(0, 10) : '') &&
      endDate === (task.due_date ? task.due_date.slice(0, 10) : '') &&
      JSON.stringify(assigneeIds) === JSON.stringify(task.assignee_ids);

    if (isSameAsOriginal) return;

    if (saveDebounceRef.current) {
      window.clearTimeout(saveDebounceRef.current);
    }

    saveDebounceRef.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        await onUpdateTask({
          title,
          description,
          status,
          priority,
          assigneeIds,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
      } finally {
        setSaving(false);
      }
    }, 600);

    return () => {
      if (saveDebounceRef.current) {
        window.clearTimeout(saveDebounceRef.current);
      }
    };
  }, [title, description, status, priority, assigneeIds, startDate, endDate, task, onUpdateTask]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = commentText.trim();
    const hasAttachments = attachments.length > 0;
    if (!text && !hasAttachments) return;

    setSending(true);
    try {
      const payloadAttachments = await Promise.all(
        attachments.map(async (file) => ({
          filename: file.name,
          mimeType: file.type,
          dataUrl: await readFileAsDataUrl(file),
        }))
      );
      await onSendComment(text, payloadAttachments.length > 0 ? payloadAttachments : undefined);
      setCommentText('');
      setAttachments([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send comment';
      toast({
        title: 'Send failed',
        description: message,
      });
    } finally {
      setSending(false);
    }
  };

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleEmojiSelect = (emoji: string) => {
    setCommentText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

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

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length === 0) return;
    const oversize = pastedFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversize) {
      e.preventDefault();
      toast({
        title: 'Image too large',
        description: `${oversize.name || 'Pasted image'} is larger than 4 MB.`,
      });
      return;
    }

    e.preventDefault();
    setAttachments((prev) => [...prev, ...pastedFiles]);
  };

  const commonEmojis = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '✨', '👌', '😍', '🙌'];

  useEffect(() => {
    if (!assigneeDropdownOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!assigneeDropdownRef.current?.contains(target)) {
        setAssigneeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [assigneeDropdownOpen]);

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="flex flex-col h-[88vh] w-[min(96vw,1220px)] bg-gray-50 text-gray-800 font-sans overflow-hidden rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-5 px-4 py-2 bg-white border-b border-gray-200 text-xs">
          {(['task', 'doc', 'reminder', 'whiteboard', 'dashboard'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-semibold capitalize rounded-lg transition-all ${
                activeTab === tab ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab === 'task' && '📋'}
              {tab === 'doc' && '📄'}
              {tab === 'reminder' && '⏰'}
              {tab === 'whiteboard' && '✏️'}
              {tab === 'dashboard' && '📊'}
              {' '}{tab}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-white to-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <div className="bg-gradient-to-br from-purple-100 to-purple-50 p-1.5 rounded-lg text-purple-600">
              <MessageSquare size={14} />
            </div>
            <span className="font-semibold">Team Space</span>
            <ChevronRight size={14} className="text-gray-300" />
            <span>Task</span>
            <ChevronRight size={14} className="text-gray-300" />
            <div className="flex items-center gap-1 font-bold text-gray-800 bg-purple-50 px-2 py-1 rounded">
              <span className="text-purple-600">#</span>
              <span>Detail</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-gray-400">
            <div className="flex items-center gap-1 text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full font-medium">
              <BrainCircuit size={14} /> Ask AI
            </div>
            <button onClick={() => setActivePopup('share')} className="cursor-pointer hover:text-gray-600">
              <Share2 size={18} />
            </button>
            <Settings size={18} className="cursor-pointer hover:text-gray-600" />
            <MoreHorizontal size={18} className="cursor-pointer hover:text-gray-600" />
            <Maximize2 size={18} className="cursor-pointer hover:text-gray-600" />
            <X size={20} className="cursor-pointer hover:text-gray-600" onClick={onClose} />
          </div>
        </div>

        {activeTab === 'task' ? (
          <div className="flex flex-1 overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto bg-white p-4">
            <div className="max-w-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full border-2 border-purple-300 flex items-center justify-center bg-purple-50">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                </div>
                <span className="text-[10px] text-purple-600 font-bold tracking-widest">TASK</span>
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-bold text-gray-900 w-full mb-3 outline-none placeholder-gray-300 hover:bg-gray-50 p-2 rounded-lg transition-colors"
                placeholder="Task title..."
              />

              <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-white border border-purple-200 rounded-lg shadow-sm p-2 mb-3 flex items-center gap-2 hover:shadow-md transition-shadow">
                <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-1.5 rounded-lg flex-shrink-0">
                  <BrainCircuit size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-700 leading-tight">
                    <span className="text-purple-600 font-bold">✨ AI</span> - description, summary, similar tasks
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <PropertyItem icon={<span className="w-3 h-3 bg-gradient-to-br from-green-400 to-green-600 rounded-full inline-block" />} label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                  >
                    <option value="todo">📋 TO DO</option>
                    <option value="in_progress">⏳ IN PROGRESS</option>
                    <option value="hold">⏸️ HOLD</option>
                    <option value="revision">🔄 REVISION</option>
                    <option value="complete">✅ COMPLETE</option>
                  </select>
                </PropertyItem>

                <PropertyItem icon={<Flag size={14} className="text-red-500" />} label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                  >
                    <option value="urgent">🔴 Urgent</option>
                    <option value="high">🟠 High</option>
                    <option value="normal">🟡 Normal</option>
                    <option value="low">🟢 Low</option>
                  </select>
                </PropertyItem>

                <PropertyItem icon={<User size={14} />} label="Assignees">
                  <div className="relative" ref={assigneeDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setAssigneeDropdownOpen((s) => !s)}
                      className="w-full h-8 px-2 py-1 text-xs font-semibold border border-gray-200 rounded-lg bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all text-left text-gray-700"
                    >
                      {assigneeIds.length > 0 ? `👤 ${assigneeIds.map((id) => memberOptions.find((m) => m.id === id)?.label ?? id).slice(0, 1).join(', ')}` : '+ Add'}
                    </button>
                    {assigneeDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-xl p-2">
                        <div className="relative mb-2">
                          <Search className="w-3 h-3 text-gray-400 absolute left-2 top-2" />
                          <input
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full h-7 pl-7 pr-2 text-xs rounded-lg border border-gray-200 bg-white focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                          />
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {filteredMembers.map((member) => {
                            const selected = assigneeIds.includes(member.id);
                            return (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => toggleAssignee(member.id)}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium transition-all ${
                                  selected
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}
                              >
                                <span>{member.label}</span>
                                {selected && <Check className="w-4 h-4" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </PropertyItem>

                <PropertyItem icon={<Calendar size={14} />} label="Dates">
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1 h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                    />
                    <div className="text-gray-300 text-xs">→</div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                    />
                  </div>
                </PropertyItem>

                <PropertyItem icon={<ListChecks size={14} />} label="Sprint">
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full h-8 px-2 py-1 text-xs font-bold rounded-lg border border-gray-200 bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                  />
                </PropertyItem>

                <PropertyItem icon={<Clock size={14} />} label="Time">
                  <button onClick={() => setActivePopup('time')} className="w-full h-8 px-2 py-1 flex items-center justify-center gap-1 text-xs font-semibold bg-purple-100 border border-purple-200 rounded-lg hover:bg-purple-200 transition-all text-purple-700">
                    <Play size={12} /> <span>Start</span>
                  </button>
                </PropertyItem>

                <PropertyItem icon={<Tag size={16} />} label="Tags">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Tag..."
                      className="flex-1 h-8 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white hover:border-purple-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                    />
                    <button className="h-8 px-2 bg-purple-100 text-purple-600 font-bold rounded-lg hover:bg-purple-200 transition-all text-xs">
                      +
                    </button>
                  </div>
                </PropertyItem>
              </div>

              <div className="mb-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add task description..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100 resize-none bg-white transition-all"
                />
              </div>

              <div className="space-y-1 border-t border-gray-100 pt-2 mt-2">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Actions</h4>
                <ActionButton icon={<Plus size={14} />} text="Add subtask" />
                <ActionButton icon={<ListChecks size={14} />} text="Checklist" />
                <ActionButton icon={<Link size={14} />} text="Relate items" />
                <div className="relative">
                  <div onClick={() => setActivePopup((p) => (p === 'attach' ? null : 'attach'))}>
                    <ActionButton icon={<Paperclip size={16} />} text="Attach file" />
                  </div>
                  {activePopup === 'attach' && <AttachDropdown onClose={() => setActivePopup(null)} />}
                </div>
              </div>
            </div>
          </div>

          <div className="w-[420px] border-l border-gray-200 bg-gradient-to-b from-white via-white to-gray-50 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-purple-100 to-purple-50 p-2 rounded-lg">
                  <MessageSquare size={16} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Activity</h3>
                  <p className="text-xs text-gray-400">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <button className="p-2 hover:bg-gray-100 rounded-md transition-colors" title="Settings">
                  <Settings size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingComments && (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400 font-medium">
                  <div className="animate-spin mr-2">⊙</div> Loading comments...
                </div>
              )}
              {!loadingComments && comments.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <div className="bg-purple-50 p-4 rounded-full mb-4">
                    <MessageSquare size={32} className="text-purple-300" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">No conversations yet</h4>
                  <p className="text-xs text-gray-400">Start the discussion by adding a comment below</p>
                </div>
              )}
              <div className="space-y-3 p-5">
                {comments.map((comment, idx) => (
                  <div key={comment.id} className="group">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {(comment.author_name || 'U').charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-gray-900">{comment.author_name || 'Anonymous'}</p>
                          <time className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            {new Date(comment.created_at).toLocaleString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </time>
                        </div>
                        <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-xs hover:shadow-sm transition-shadow">
                          <p className="text-sm text-gray-700 leading-relaxed break-words whitespace-pre-wrap">{comment.content || '📎 Image attached'}</p>
                          {comment.attachments?.length ? (
                            <div className="mt-3 grid gap-2">
                              {comment.attachments.map((attachment, idx) => (
                                <div key={idx} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                  {attachment.mimeType.startsWith('image/') ? (
                                    <img src={attachment.dataUrl} alt={attachment.filename} className="w-full h-auto object-cover" />
                                  ) : (
                                    <div className="flex items-center gap-2 p-3 text-sm text-gray-700">
                                      <FileText size={16} />
                                      <span>{attachment.filename}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {comment.read_by && comment.read_by.length > 0 && (
                          <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                            <span className="font-medium text-gray-400">Seen by </span>
                            {comment.read_by.map((r) => r.name || r.user_id).join(', ')}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-xs text-gray-400 hover:text-purple-600 transition-colors font-medium">👍 Like</button>
                          <button className="text-xs text-gray-400 hover:text-purple-600 transition-colors font-medium">💬 Reply</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form className="border-t border-gray-100 bg-white p-5 space-y-3 shadow-lg" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onPaste={handlePaste}
                    className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 resize-none placeholder-gray-400 transition-all"
                    placeholder="Share your thoughts... ✨"
                    rows={2}
                  />

                  {attachments.length > 0 && (
                    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50/70 p-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-gray-500">
                        <span>Attachment</span>
                        <span>{attachments.length} file{attachments.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {attachments.map((file, idx) => {
                          const isImage = file.type.startsWith('image/');
                          const previewUrl = isImage ? URL.createObjectURL(file) : null;

                          return (
                            <div key={idx} className="min-w-[180px] max-w-[220px] rounded-lg border border-gray-200 bg-white p-2">
                              <div className="flex items-center gap-2">
                                {isImage && previewUrl ? (
                                  <img
                                    src={previewUrl}
                                    alt={file.name}
                                    className="h-12 w-12 rounded-md border border-gray-200 object-cover"
                                  />
                                ) : (
                                  <FileText size={16} className="text-purple-500 flex-shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-gray-800">{file.name}</p>
                                  <p className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAttachment(idx)}
                                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleAttachmentClick}
                      className="p-2 hover:bg-purple-50 rounded-lg text-gray-500 hover:text-purple-600 transition-all"
                      title="Attach file"
                    >
                      <Paperclip size={18} />
                    </button>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-2 hover:bg-purple-50 rounded-lg text-gray-500 hover:text-purple-600 transition-all relative"
                      title="Add emoji"
                    >
                      <Smile size={18} />
                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-50 w-72">
                          <div className="grid grid-cols-5 gap-1">
                            {commonEmojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleEmojiSelect(emoji)}
                                className="text-2xl hover:bg-purple-50 rounded-lg p-2 transition-all hover:scale-110"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      className="p-2 hover:bg-purple-50 rounded-lg text-gray-500 hover:text-purple-600 transition-all"
                      title="Mention"
                    >
                      <AtSign size={18} />
                    </button>
                    <button
                      type="button"
                      className="p-2 hover:bg-purple-50 rounded-lg text-gray-500 hover:text-purple-600 transition-all"
                      title="Add image"
                    >
                      <ImageIcon size={18} />
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={sending || (!commentText.trim() && attachments.length === 0)}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-4 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
                  >
                    <Send size={16} />
                    <span>Send</span>
                  </button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </form>
          </div>
        </div>
        ) : (
          <div className="flex-1 bg-white p-8 flex flex-col justify-between">
            <div className="text-sm text-gray-500">
              {activeTab === 'doc' && 'Create Doc'}
              {activeTab === 'reminder' && 'Create Reminder'}
              {activeTab === 'whiteboard' && 'Create Whiteboard'}
              {activeTab === 'dashboard' && 'Create Dashboard'}
            </div>
            <div className="flex justify-end">
              <button className="h-8 px-4 bg-purple-600 text-white rounded text-xs font-semibold">
                Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </button>
            </div>
          </div>
        )}
      </div>
      {activePopup === 'share' && <ShareModal onClose={() => setActivePopup(null)} />}
      {activePopup === 'time' && <TimeTrackPopup onClose={() => setActivePopup(null)} />}
    </div>
  );
}

const PropertyItem = ({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="bg-white rounded-lg p-2.5 border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all group">
    <div className="flex items-center gap-1.5 mb-2">
      <div className="text-gray-400 group-hover:text-purple-600 transition-colors">{icon}</div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-600 group-hover:text-gray-900 transition-colors">{label}</label>
    </div>
    <div className="text-gray-800">{children}</div>
  </div>
);

const ActionButton = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <button className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-purple-700 hover:bg-purple-50 text-xs group transition-all rounded-lg border border-transparent hover:border-purple-200 font-medium">
    <span className="text-gray-400 group-hover:text-purple-600">{icon}</span>
    <span>{text}</span>
  </button>
);

const ShareModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
    <div className="bg-white rounded-xl shadow-2xl w-[500px] overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b">
        <h3 className="font-bold">Share this task</h3>
        <X size={18} className="cursor-pointer" onClick={onClose} />
      </div>
      <div className="p-5 space-y-4">
        <div className="text-xs text-gray-500">Sharing task</div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-1.5 text-sm outline-purple-500" placeholder="Invite by name or email" />
          <button className="bg-purple-600 text-white px-4 py-1.5 rounded text-sm font-medium">Invite</button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2"><Link size={16} /> Private link</span>
            <button className="border px-3 py-1 rounded text-xs hover:bg-gray-50 flex items-center gap-1"><Copy size={12} /> Copy link</button>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2"><User size={16} /> Default permission</span>
            <select className="text-xs font-semibold bg-gray-50 border p-1 rounded"><option>Full edit</option></select>
          </div>
        </div>
        <button className="w-full mt-4 flex items-center justify-center gap-2 border py-2 rounded text-sm font-semibold hover:bg-gray-50">
          <Lock size={14} /> Make Private
        </button>
      </div>
    </div>
  </div>
);

const TimeTrackPopup = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[60] pointer-events-none">
    <div className="pointer-events-auto absolute top-24 left-1/2 -translate-x-1/2 w-80 bg-white shadow-2xl border rounded-lg p-4">
      <div className="flex justify-between mb-4">
        <span className="text-xs font-bold">Time on this task</span>
        <span className="text-xs text-gray-400 font-bold">0h</span>
      </div>
      <div className="relative mb-4">
        <input className="w-full border rounded-lg p-2.5 text-xs pr-10 focus:ring-1 focus:ring-purple-400 outline-none" placeholder="Enter time (ex: 3h 20m) or start timer" />
        <Play size={16} fill="currentColor" className="absolute right-3 top-2.5 text-gray-300" />
      </div>
      <div className="space-y-2 text-xs text-gray-500">
        <div className="flex items-center gap-2"><Clock size={14} /> Tue, Apr 14 4:48 pm — 4:48 pm</div>
        <div className="flex items-center gap-2"><MessageSquare size={14} /> Notes</div>
        <div className="flex items-center gap-2"><Tag size={14} /> Add tags</div>
      </div>
      <div className="mt-6 flex justify-end items-center border-t pt-3 gap-2">
        <button className="text-xs text-gray-500 px-3" onClick={onClose}>Cancel</button>
        <button className="bg-purple-600 text-white text-xs px-4 py-1.5 rounded font-bold flex items-center gap-1"><Save size={12} /> Save</button>
      </div>
    </div>
  </div>
);

const AttachDropdown = ({ onClose }: { onClose: () => void }) => (
  <div className="absolute bottom-full left-0 mb-2 w-48 bg-white shadow-xl border rounded-lg z-20 py-1 flex flex-col">
    <div className="px-3 py-2 text-[10px] text-gray-400 uppercase font-bold border-b mb-1">Upload from</div>
    {[
      { icon: <Upload size={14} />, label: 'Upload file' },
      { icon: <FileText size={14} />, label: 'New Document' },
      { icon: <Download size={14} />, label: 'Dropbox' },
      { icon: <Globe size={14} />, label: 'Google Drive' },
    ].map((item, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-xs text-gray-700" onClick={onClose}>
        {item.icon} <span>{item.label}</span>
      </div>
    ))}
  </div>
);
