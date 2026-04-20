import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/hooks/use-toast';
import {
  X, Maximize2, MoreHorizontal, Settings, Share2,
  MessageSquare, User, Calendar, Flag, Clock,
  Tag, ChevronRight, Plus, ListChecks, Link, Paperclip,
  Smile, AtSign, Video, Mic, Image as ImageIcon, Send, BrainCircuit, Check, Search,
  Copy, Lock, Globe, Upload, FileText, Download, Play, Save, Trash2, ExternalLink, ChevronDown,
  UserPlus, CheckSquare, Calendar as CalendarIcon, Flag as FlagIcon, Box, MoreVertical
} from 'lucide-react';
import type { Task, TaskPriority, CommentAttachment, ChecklistItem } from '@/types';

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
  /** When set, this comment is a threaded reply to the referenced comment. */
  parent_comment_id?: string | null;
  /** Emoji reactions (one entry per (emoji, user) pair). */
  reactions?: Array<{ emoji: string; user_id: string; user_name?: string }>;
}

interface TaskDetailDialogProps {
  task: Task;
  memberOptions: { id: string; label: string }[];
  comments: TaskCommentView[];
  loadingComments: boolean;
  onClose: () => void;
  onSendComment: (
    content: string,
    attachments?: CommentAttachment[],
    parentCommentId?: string,
  ) => Promise<void>;
  /** Toggle an emoji reaction for the current user on an existing comment. */
  onToggleReaction?: (commentId: string, emoji: string) => Promise<void> | void;
  /** When set, status dropdown matches board columns (including custom). */
  statusOptions?: { value: string; label: string }[];
  onUpdateTask: (payload: {
    title?: string;
    description?: string;
    status?: string;
    priority?: TaskPriority;
    assigneeIds?: string[];
    startDate?: string;
    endDate?: string;
    checklist?: Array<{ id?: string; text: string; done: boolean; assigneeIds?: string[] }>;
    relatedTaskIds?: string[];
    defaultPermission?: 'full_edit' | 'edit' | 'comment' | 'view';
    collaborators?: Array<{ userId: string; role: 'full_edit' | 'edit' | 'comment' | 'view' }>;
    isPrivate?: boolean;
  }) => Promise<void>;
  /** Optional — create a stand-alone reminder linked to this task. */
  onCreateReminder?: (payload: {
    title: string;
    description?: string;
    dueDate: string;
    notifyUserIds?: string[];
  }) => Promise<void> | void;
  currentUserId?: string;
  /** Subtasks (already loaded) whose `parent_task_id` equals this task's id. */
  subtasks?: Task[];
  /** Create a new subtask under this task — parent provides the list/workspace context. */
  onCreateSubtask?: (
    parentTaskId: string,
    payload: {
      title: string;
      priority?: TaskPriority;
      assigneeIds?: string[];
      startDate?: string;
      dueDate?: string;
    }
  ) => Promise<void> | void;
  /** Navigate to another task — used by subtask cards and related-item chips. */
  onOpenTask?: (taskId: string) => void;
  /** Search for tasks (used by Relate items) scoped to the task's workspace. */
  onSearchTasks?: (
    query: string
  ) => Promise<
    Array<{ id: string; title: string; status: string; list_name?: string | null; space_name?: string | null }>
  >;
  /** Resolve labels for already-linked related task ids (when not in the local tasks cache). */
  onResolveRelatedTasks?: (
    taskIds: string[]
  ) => Promise<
    Array<{ id: string; title: string; status: string; list_name?: string | null; space_name?: string | null }>
  >;
}

const DEFAULT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'todo', label: '📋 TO DO' },
  { value: 'in_progress', label: '⏳ IN PROGRESS' },
  { value: 'hold', label: '⏸️ HOLD' },
  { value: 'revision', label: '🔄 REVISION' },
  { value: 'complete', label: '✅ COMPLETE' },
];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'text-red-500',
  high: 'text-orange-500',
  normal: 'text-blue-500',
  low: 'text-gray-400',
};

/** Quick-pick emojis shown in the reaction popover below each comment. */
const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '👏', '🚀', '🔥', '✅'] as const;

const TYPE_OPTIONS: Array<{ value: 'task' | 'milestone' | 'form' | 'meeting' | 'process' | 'project'; label: string; hint?: string }> = [
  { value: 'task', label: 'Task', hint: 'default' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'form', label: 'Form Response' },
  { value: 'meeting', label: 'Meeting Note' },
  { value: 'process', label: 'Process' },
  { value: 'project', label: 'Project' },
];

export function TaskDetailDialog({
  task,
  memberOptions,
  comments,
  loadingComments,
  onClose,
  onSendComment,
  onToggleReaction,
  statusOptions,
  onUpdateTask,
  onCreateReminder,
  currentUserId,
  subtasks = [],
  onCreateSubtask,
  onOpenTask,
  onSearchTasks,
  onResolveRelatedTasks,
}: TaskDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<'task' | 'doc' | 'reminder' | 'whiteboard' | 'dashboard'>('task');
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState<string>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [startDate, setStartDate] = useState(task.start_date ? task.start_date.slice(0, 10) : '');
  const [endDate, setEndDate] = useState(task.due_date ? task.due_date.slice(0, 10) : '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assignee_ids);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [activePopup, setActivePopup] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [inlineMention, setInlineMention] = useState<{ start: number; query: string } | null>(null);
  const [inlineMentionIndex, setInlineMentionIndex] = useState(0);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderBody, setReminderBody] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  /** Which comment currently has its inline reply composer open. */
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  /** Draft text for the inline reply composer (per currently-open comment). */
  const [replyText, setReplyText] = useState('');
  /** Which comment currently has its emoji-reaction picker open. */
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  /** In-flight submission flag for the reply composer. */
  const [sendingReply, setSendingReply] = useState(false);

  // --- Subtasks / Checklist / Relate items ---
  const [subtasksOpen, setSubtasksOpen] = useState(true);
  const [subtaskComposerOpen, setSubtaskComposerOpen] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskSubmitting, setSubtaskSubmitting] = useState(false);
  /** Purely cosmetic — ClickUp-style "type" selector. Doesn't change backend behavior. */
  const [subtaskType, setSubtaskType] = useState<'task' | 'milestone' | 'form' | 'meeting' | 'process' | 'project'>(
    'task',
  );
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority>('normal');
  const [subtaskAssigneeIds, setSubtaskAssigneeIds] = useState<string[]>([]);
  const [subtaskStart, setSubtaskStart] = useState<string>(''); // yyyy-mm-dd
  const [subtaskDue, setSubtaskDue] = useState<string>('');
  /** Which popover (if any) is visible above the composer toolbar. */
  const [composerPopover, setComposerPopover] =
    useState<null | 'type' | 'priority' | 'assignee' | 'date'>(null);
  /** Which checklist item has its assignee picker open. */
  const [checklistAssigneeFor, setChecklistAssigneeFor] = useState<string | null>(null);
  /** Header assign-to-all popover toggle. */
  const [checklistBulkAssignOpen, setChecklistBulkAssignOpen] = useState(false);
  /**
   * Default assignees applied to NEW checklist items added via the composer.
   * Also used as the "bulk assignee" selection shown in the header when the
   * checklist is empty (so users can configure assignees *before* they add items).
   */
  const [checklistDefaultAssignees, setChecklistDefaultAssignees] = useState<string[]>([]);

  const [checklistOpen, setChecklistOpen] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist ?? []);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [checklistDraftOpen, setChecklistDraftOpen] = useState(false);

  const [relateOpen, setRelateOpen] = useState(false);
  const [relateQuery, setRelateQuery] = useState('');
  const [relateResults, setRelateResults] = useState<
    Array<{ id: string; title: string; status: string; list_name?: string | null; space_name?: string | null }>
  >([]);
  const [relateSearching, setRelateSearching] = useState(false);
  const [relatedIds, setRelatedIds] = useState<string[]>(task.related_task_ids ?? []);
  const [relatedMeta, setRelatedMeta] = useState<
    Record<string, { title: string; status: string; list_name?: string | null; space_name?: string | null }>
  >({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement | null>(null);
  const mentionPickerRef = useRef<HTMLDivElement | null>(null);

  const filteredMembers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [assigneeSearch, memberOptions]);

  const statusSelectOptions = useMemo(() => {
    const base = statusOptions && statusOptions.length > 0 ? [...statusOptions] : [...DEFAULT_STATUS_OPTIONS];
    if (!base.some((o) => o.value === task.status)) {
      base.push({ value: task.status, label: task.status });
    }
    return base;
  }, [statusOptions, task.status]);

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
    setChecklist(task.checklist ?? []);
    setRelatedIds(task.related_task_ids ?? []);
    const timer = window.setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [task]);

  // When the set of related ids changes, fetch nice labels for any we don't know about yet.
  useEffect(() => {
    if (!onResolveRelatedTasks) return;
    const missing = relatedIds.filter((id) => !relatedMeta[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    onResolveRelatedTasks(missing)
      .then((rows) => {
        if (cancelled) return;
        setRelatedMeta((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            next[row.id] = {
              title: row.title,
              status: row.status,
              list_name: row.list_name ?? null,
              space_name: row.space_name ?? null,
            };
          }
          return next;
        });
      })
      .catch((err) => console.error('Failed to resolve related tasks', err));
    return () => {
      cancelled = true;
    };
  }, [relatedIds, onResolveRelatedTasks, relatedMeta]);

  // Debounced search for the Relate items picker.
  useEffect(() => {
    if (!relateOpen || !onSearchTasks) return;
    const q = relateQuery.trim();
    if (!q) {
      setRelateResults([]);
      return;
    }
    let cancelled = false;
    setRelateSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const rows = await onSearchTasks(q);
        if (cancelled) return;
        setRelateResults(rows);
      } catch (err) {
        if (!cancelled) console.error('Task search failed', err);
      } finally {
        if (!cancelled) setRelateSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [relateQuery, relateOpen, onSearchTasks]);

  const persistChecklist = async (next: ChecklistItem[]) => {
    setChecklist(next);
    try {
      await onUpdateTask({
        checklist: next.map((item) => ({
          id: item.id,
          text: item.text,
          done: item.done,
          assigneeIds: item.assignee_ids ?? [],
        })),
      });
    } catch (err) {
      console.error('Failed to save checklist', err);
      toast({ title: 'Checklist save failed', description: err instanceof Error ? err.message : 'Please retry.' });
    }
  };

  const persistRelatedIds = async (next: string[]) => {
    setRelatedIds(next);
    try {
      await onUpdateTask({ relatedTaskIds: next });
    } catch (err) {
      console.error('Failed to save related tasks', err);
      toast({ title: 'Could not update related tasks' });
    }
  };

  const checklistDoneCount = checklist.filter((item) => item.done).length;

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

  const handleImageAttachmentClick = () => {
    imageInputRef.current?.click();
  };

  const insertMention = (member: { id: string; label: string }) => {
    const displayName = member.label.replace(/\s*\(.*?\)\s*$/, '').trim() || member.label;
    const mentionToken = `@${displayName.replace(/\s+/g, '_')}`;
    setCommentText((prev) => {
      const needsSpace = prev && !prev.endsWith(' ') && !prev.endsWith('\n');
      return `${prev}${needsSpace ? ' ' : ''}${mentionToken} `;
    });
    setShowMentionPicker(false);
    setMentionSearch('');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const filteredMentionMembers = useMemo(() => {
    const q = mentionSearch.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(q));
  }, [mentionSearch, memberOptions]);

  const inlineMentionMatches = useMemo(() => {
    if (!inlineMention) return [] as typeof memberOptions;
    const q = inlineMention.query.trim().toLowerCase();
    if (!q) return memberOptions.slice(0, 8);
    return memberOptions
      .filter((m) => m.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [inlineMention, memberOptions]);

  const handleCommentInput = (value: string, caret: number) => {
    setCommentText(value);
    // Scan backwards from caret for a @ that starts a mention token.
    let i = caret - 1;
    let foundAt = -1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === '@') {
        const prev = i === 0 ? ' ' : value[i - 1];
        if (/[\s\n]/.test(prev) || i === 0) {
          foundAt = i;
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i -= 1;
    }
    if (foundAt >= 0) {
      const query = value.slice(foundAt + 1, caret);
      if (/^[\w.\-]*$/.test(query)) {
        setInlineMention({ start: foundAt, query });
        setInlineMentionIndex(0);
        return;
      }
    }
    setInlineMention(null);
  };

  const applyInlineMention = (member: { id: string; label: string }) => {
    if (!inlineMention) return;
    const displayName = member.label.replace(/\s*\(.*?\)\s*$/, '').trim() || member.label;
    const token = `@${displayName.replace(/\s+/g, '_')} `;
    const before = commentText.slice(0, inlineMention.start);
    const afterStart = inlineMention.start + 1 + inlineMention.query.length;
    const after = commentText.slice(afterStart);
    const next = `${before}${token}${after}`;
    setCommentText(next);
    setInlineMention(null);
    setInlineMentionIndex(0);
    window.setTimeout(() => {
      const pos = (before + token).length;
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    }, 0);
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

  useEffect(() => {
    if (!showMentionPicker) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!mentionPickerRef.current?.contains(target)) {
        setShowMentionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showMentionPicker]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="flex flex-col h-[88vh] w-[min(96vw,1220px)] bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-slate-200 font-sans overflow-hidden rounded-lg shadow-2xl dark:shadow-black/60 ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-5 px-4 py-2 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 text-xs">
          {(['task', 'doc', 'reminder', 'whiteboard', 'dashboard'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-semibold capitalize rounded-lg transition-all ${
                activeTab === tab ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 shadow-sm' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
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
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-white dark:from-slate-900 to-gray-50 dark:to-slate-900/80 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
            <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-950/30 p-1.5 rounded-lg text-purple-600 dark:text-purple-400">
              <MessageSquare size={14} />
            </div>
            <span className="font-semibold">Team Space</span>
            <ChevronRight size={14} className="text-gray-300 dark:text-slate-600" />
            <span>Task</span>
            <ChevronRight size={14} className="text-gray-300 dark:text-slate-600" />
            <div className="flex items-center gap-1 font-bold text-gray-800 dark:text-slate-200 bg-purple-50 dark:bg-purple-950/40 px-2 py-1 rounded">
              <span className="text-purple-600 dark:text-purple-400">#</span>
              <span>Detail</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-gray-400 dark:text-slate-500">
            <div className="flex items-center gap-1 text-xs bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full font-medium">
              <BrainCircuit size={14} /> Ask AI
            </div>
            <button onClick={() => setActivePopup('share')} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300">
              <Share2 size={18} />
            </button>
            <Settings size={18} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300" />
            <MoreHorizontal size={18} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300" />
            <Maximize2 size={18} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300" />
            <X size={20} className="cursor-pointer hover:text-gray-600 dark:hover:text-slate-300" onClick={onClose} />
          </div>
        </div>

        {activeTab === 'task' ? (
          <div className="flex flex-1 overflow-hidden bg-white dark:bg-slate-900">
          <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 p-4">
            <div className="max-w-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full border-2 border-purple-300 flex items-center justify-center bg-purple-50 dark:bg-purple-950/40">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                </div>
                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold tracking-widest">TASK</span>
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-transparent text-2xl font-bold text-gray-900 dark:text-slate-100 w-full mb-3 outline-none placeholder-gray-300 dark:placeholder-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800/70 p-2 rounded-lg transition-colors caret-purple-500"
                placeholder="Task title..."
              />

              <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-white dark:from-purple-950/40 dark:via-blue-950/30 dark:to-slate-900 border border-purple-200 dark:border-purple-800/50 rounded-lg shadow-sm dark:shadow-black/30 p-2 mb-3 flex items-center gap-2 hover:shadow-md transition-shadow">
                <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-1.5 rounded-lg flex-shrink-0">
                  <BrainCircuit size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-700 dark:text-slate-300 leading-tight">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">✨ AI</span> - description, summary, similar tasks
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <PropertyItem icon={<span className="w-3 h-3 bg-gradient-to-br from-green-400 to-green-600 rounded-full inline-block" />} label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                  >
                    {statusSelectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </PropertyItem>

                <PropertyItem icon={<Flag size={14} className="text-red-500" />} label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
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
                      className="w-full h-8 px-2 py-1 text-xs font-semibold border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all text-left text-gray-700 dark:text-slate-300"
                    >
                      {assigneeIds.length > 0 ? `👤 ${assigneeIds.map((id) => memberOptions.find((m) => m.id === id)?.label ?? id).slice(0, 1).join(', ')}` : '+ Add'}
                    </button>
                    {assigneeDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
                        <div className="relative mb-2">
                          <Search className="w-3 h-3 text-gray-400 dark:text-slate-500 absolute left-2 top-2" />
                          <input
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full h-7 pl-7 pr-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
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
                                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200'
                                    : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'
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
                      className="flex-1 h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                    />
                    <div className="text-gray-300 dark:text-slate-600 text-xs">→</div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 h-8 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                    />
                  </div>
                </PropertyItem>

                <PropertyItem icon={<ListChecks size={14} />} label="Sprint">
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full h-8 px-2 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                  />
                </PropertyItem>

                <PropertyItem icon={<Clock size={14} />} label="Time">
                  <button onClick={() => setActivePopup('time')} className="w-full h-8 px-2 py-1 flex items-center justify-center gap-1 text-xs font-semibold bg-purple-100 dark:bg-purple-900/50 border border-purple-200 rounded-lg hover:bg-purple-200 transition-all text-purple-700 dark:text-purple-300">
                    <Play size={12} /> <span>Start</span>
                  </button>
                </PropertyItem>

                <PropertyItem icon={<Tag size={16} />} label="Tags">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="Tag..."
                      className="flex-1 h-8 px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-purple-300 dark:hover:border-purple-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-100 transition-all"
                    />
                    <button className="h-8 px-2 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 font-bold rounded-lg hover:bg-purple-200 transition-all text-xs">
                      +
                    </button>
                  </div>
                </PropertyItem>
              </div>

              <div className="mb-3">
                <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add task description..."
                  rows={2}
                  className="w-full border border-gray-200 dark:border-slate-700 rounded-lg p-2 text-xs focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100 resize-none bg-white dark:bg-slate-900 transition-all"
                />
              </div>

              <div className="border-t border-gray-100 dark:border-slate-800 pt-3 mt-2">
                {/* "Add fields" pill (purely decorative header to match ClickUp layout) */}
                <div className="px-2.5 py-2 mb-3 rounded-md bg-gray-50 dark:bg-slate-800/60 text-[12px] font-semibold text-gray-600 dark:text-slate-300 flex items-center gap-2">
                  <Plus size={13} />
                  Add fields
                </div>

                {/* --- Add subtask --- */}
                <SectionRow
                  open={subtasksOpen}
                  onToggle={() => setSubtasksOpen((v) => !v)}
                  label="Add subtask"
                  count={subtasks.length > 0 ? `${subtasks.filter((s) => s.status === 'complete').length}/${subtasks.length}` : undefined}
                  trailing={
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubtasksOpen(true);
                          setSubtaskComposerOpen(true);
                        }}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400"
                        title="Add subtask"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  }
                >
                  <div className="space-y-1.5">
                    {subtasks.map((sub) => {
                      const done = sub.status === 'complete';
                      return (
                        <div
                          key={sub.id}
                          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => onOpenTask?.(sub.id)}
                            title="Open subtask to change status"
                            className="accent-purple-500 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => onOpenTask?.(sub.id)}
                            className={`flex-1 text-left text-[13px] truncate ${
                              done
                                ? 'line-through text-gray-400 dark:text-slate-500'
                                : 'text-gray-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400'
                            }`}
                            title={sub.title}
                          >
                            {sub.title}
                          </button>
                          <ExternalLink
                            size={12}
                            className="text-gray-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition"
                          />
                        </div>
                      );
                    })}

                    {onCreateSubtask && subtaskComposerOpen && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const t = subtaskDraft.trim();
                          if (!t) return;
                          setSubtaskSubmitting(true);
                          try {
                            await onCreateSubtask(task.id, {
                              title: t,
                              priority: subtaskPriority,
                              assigneeIds: subtaskAssigneeIds,
                              startDate: subtaskStart || undefined,
                              dueDate: subtaskDue || undefined,
                            });
                            setSubtaskDraft('');
                            setSubtaskComposerOpen(false);
                            setSubtaskType('task');
                            setSubtaskPriority('normal');
                            setSubtaskAssigneeIds([]);
                            setSubtaskStart('');
                            setSubtaskDue('');
                            setComposerPopover(null);
                          } finally {
                            setSubtaskSubmitting(false);
                          }
                        }}
                        className="relative flex items-center gap-1.5 py-2 border-b border-dashed border-gray-200 dark:border-slate-700"
                      >
                        <span className="w-4 h-4 rounded-full border border-dashed border-gray-300 dark:border-slate-600 shrink-0" aria-hidden />
                        <input
                          autoFocus
                          type="text"
                          value={subtaskDraft}
                          onChange={(e) => setSubtaskDraft(e.target.value)}
                          placeholder="Add Task"
                          className="flex-1 bg-transparent text-[13px] outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setSubtaskComposerOpen(false);
                              setSubtaskDraft('');
                              setComposerPopover(null);
                            }
                          }}
                        />
                        <div className="flex items-center gap-0.5 text-gray-400 dark:text-slate-500 relative">
                          {/* Type */}
                          <ComposerIconBtn
                            active={composerPopover === 'type'}
                            title={`Type: ${subtaskType}`}
                            onClick={() => setComposerPopover((p) => (p === 'type' ? null : 'type'))}
                          >
                            <Box size={14} className={subtaskType !== 'task' ? 'text-purple-600' : ''} />
                          </ComposerIconBtn>
                          {/* Priority */}
                          <ComposerIconBtn
                            active={composerPopover === 'priority'}
                            title={`Priority: ${subtaskPriority}`}
                            onClick={() => setComposerPopover((p) => (p === 'priority' ? null : 'priority'))}
                          >
                            <FlagIcon size={14} className={PRIORITY_COLORS[subtaskPriority]} />
                          </ComposerIconBtn>
                          <span className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-1" />
                          {/* Assignee */}
                          <ComposerIconBtn
                            active={composerPopover === 'assignee'}
                            title="Assignee"
                            onClick={() => setComposerPopover((p) => (p === 'assignee' ? null : 'assignee'))}
                          >
                            {subtaskAssigneeIds.length > 0 ? (
                              <span className="relative flex items-center">
                                <UserPlus size={14} className="text-purple-600" />
                                <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] px-[3px] rounded-full bg-purple-600 text-white text-[9px] font-bold leading-[14px] text-center">
                                  {subtaskAssigneeIds.length}
                                </span>
                              </span>
                            ) : (
                              <UserPlus size={14} />
                            )}
                          </ComposerIconBtn>
                          {/* Date */}
                          <ComposerIconBtn
                            active={composerPopover === 'date'}
                            title="Dates"
                            onClick={() => setComposerPopover((p) => (p === 'date' ? null : 'date'))}
                          >
                            <CalendarIcon size={14} className={subtaskDue ? 'text-purple-600' : ''} />
                          </ComposerIconBtn>

                          {composerPopover === 'type' && (
                            <TypePopover
                              value={subtaskType}
                              onSelect={(v) => {
                                setSubtaskType(v);
                                setComposerPopover(null);
                              }}
                              onClose={() => setComposerPopover(null)}
                              alignRight
                            />
                          )}
                          {composerPopover === 'priority' && (
                            <PriorityPopover
                              value={subtaskPriority}
                              onSelect={(v) => {
                                setSubtaskPriority(v);
                                setComposerPopover(null);
                              }}
                              onClose={() => setComposerPopover(null)}
                              alignRight
                            />
                          )}
                          {composerPopover === 'assignee' && (
                            <AssigneePopover
                              memberOptions={memberOptions}
                              currentUserId={currentUserId}
                              selectedIds={subtaskAssigneeIds}
                              onToggle={(id) =>
                                setSubtaskAssigneeIds((prev) =>
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                                )
                              }
                              onClose={() => setComposerPopover(null)}
                              alignRight
                            />
                          )}
                          {composerPopover === 'date' && (
                            <DatePopover
                              startDate={subtaskStart}
                              dueDate={subtaskDue}
                              onChange={(next) => {
                                setSubtaskStart(next.startDate);
                                setSubtaskDue(next.dueDate);
                              }}
                              onClose={() => setComposerPopover(null)}
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSubtaskComposerOpen(false);
                            setSubtaskDraft('');
                            setComposerPopover(null);
                          }}
                          className="ml-1 h-7 px-2.5 rounded-md text-[12px] font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={subtaskSubmitting || !subtaskDraft.trim()}
                          className="h-7 px-3 rounded-md bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[12px] font-semibold flex items-center gap-1"
                        >
                          {subtaskSubmitting ? '…' : 'Save'}
                          <Send size={11} />
                        </button>
                      </form>
                    )}
                  </div>
                </SectionRow>

                {/* --- Relate items / dependencies --- */}
                <button
                  type="button"
                  onClick={() => setRelateOpen((v) => !v)}
                  className="w-full flex items-center gap-2 py-2 px-1 text-[13px] text-gray-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400"
                >
                  <Link size={14} className="text-gray-400 dark:text-slate-500" />
                  <span>Relate items or add dependencies</span>
                  {relatedIds.length > 0 && (
                    <span className="ml-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                      {relatedIds.length}
                    </span>
                  )}
                </button>
                {relateOpen && (
                  <div className="px-1 pb-3 space-y-2">
                    {relatedIds.length > 0 && (
                      <div className="space-y-1">
                        {relatedIds.map((id) => {
                          const meta = relatedMeta[id];
                          return (
                            <div
                              key={id}
                              className="group flex items-center gap-2 rounded-md border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/30 px-2 py-1.5"
                            >
                              <Link size={11} className="text-blue-500 shrink-0" />
                              <button
                                type="button"
                                onClick={() => onOpenTask?.(id)}
                                className="flex-1 text-left text-[12px] truncate text-gray-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400"
                                title={meta?.title ?? id}
                              >
                                {meta?.title ?? 'Loading…'}
                                {meta?.space_name && (
                                  <span className="ml-1 text-[10px] text-gray-400 dark:text-slate-500">
                                    · {meta.space_name}
                                  </span>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void persistRelatedIds(relatedIds.filter((r) => r !== id));
                                }}
                                className="opacity-0 group-hover:opacity-100 transition text-gray-300 dark:text-slate-600 hover:text-red-500"
                                aria-label="Remove link"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 h-8">
                        <Search size={12} className="text-gray-400 dark:text-slate-500" />
                        <input
                          type="text"
                          value={relateQuery}
                          onChange={(e) => setRelateQuery(e.target.value)}
                          placeholder="Search tasks to link…"
                          className="flex-1 bg-transparent text-xs outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                        />
                        {relateSearching && (
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">…</span>
                        )}
                      </div>
                      {relateQuery.trim().length > 0 && (
                        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                          {relateResults.length === 0 && !relateSearching && (
                            <p className="px-3 py-2 text-[11px] text-gray-400 dark:text-slate-500">No matches.</p>
                          )}
                          {relateResults
                            .filter((r) => r.id !== task.id && !relatedIds.includes(r.id))
                            .map((row) => (
                              <button
                                key={row.id}
                                type="button"
                                onClick={() => {
                                  setRelatedMeta((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                      title: row.title,
                                      status: row.status,
                                      list_name: row.list_name ?? null,
                                      space_name: row.space_name ?? null,
                                    },
                                  }));
                                  void persistRelatedIds([...relatedIds, row.id]);
                                  setRelateQuery('');
                                  setRelateResults([]);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200"
                              >
                                <Link size={11} className="text-blue-500 shrink-0" />
                                <span className="truncate">{row.title}</span>
                                {(row.space_name || row.list_name) && (
                                  <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-500 shrink-0">
                                    {[row.space_name, row.list_name].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* --- Checklists --- */}
                <SectionRow
                  open={checklistOpen}
                  onToggle={() => setChecklistOpen((v) => !v)}
                  label="Checklists"
                  count={checklist.length > 0 ? `${checklistDoneCount}/${checklist.length}` : undefined}
                  trailing={
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChecklistOpen(true);
                          setChecklistDraftOpen(true);
                        }}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400"
                        title="Add item"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  }
                >
                  <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-3 space-y-2">
                    <div className="relative flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-gray-800 dark:text-slate-200">Checklist</span>
                      {(() => {
                        // Union of every user id assigned to any committed item.
                        const itemUnion = Array.from(
                          new Set(checklist.flatMap((c) => c.assignee_ids ?? [])),
                        );
                        // Effective header selection = default assignees ∪ item union.
                        // This way the header stays meaningful even when the checklist
                        // is empty or items have differing assignees.
                        const effective = Array.from(
                          new Set([...checklistDefaultAssignees, ...itemUnion]),
                        );
                        return (
                          <div className="flex items-center gap-1">
                            {effective.length > 0 && (
                              <div className="flex -space-x-1.5 mr-1">
                                {effective.slice(0, 3).map((uid) => {
                                  const label = memberOptions.find((m) => m.id === uid)?.label ?? 'User';
                                  return (
                                    <span
                                      key={uid}
                                      title={label}
                                      className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center border border-white dark:border-slate-900"
                                    >
                                      {label.charAt(0).toUpperCase()}
                                    </span>
                                  );
                                })}
                                {effective.length > 3 && (
                                  <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-[10px] font-bold flex items-center justify-center border border-white dark:border-slate-900">
                                    +{effective.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setChecklistBulkAssignOpen((v) => !v)}
                              className={`p-1 rounded-md transition ${
                                effective.length > 0
                                  ? 'text-purple-500 hover:text-purple-700'
                                  : 'text-gray-400 dark:text-slate-500 hover:text-purple-600 hover:bg-gray-100 dark:hover:bg-slate-800'
                              }`}
                              title={
                                checklist.length === 0
                                  ? 'Choose default assignees for new items'
                                  : 'Assign people to all items'
                              }
                            >
                              <UserPlus size={14} />
                            </button>
                            {checklistBulkAssignOpen && (
                              <AssigneePopover
                                memberOptions={memberOptions}
                                currentUserId={currentUserId}
                                selectedIds={effective}
                                onToggle={(uid) => {
                                  // Decide whether this click should ADD or REMOVE
                                  // the user for bulk / default selection.
                                  const isDefault = checklistDefaultAssignees.includes(uid);
                                  const assignedToAllItems =
                                    checklist.length > 0 &&
                                    checklist.every((c) => (c.assignee_ids ?? []).includes(uid));
                                  const shouldRemove = isDefault || assignedToAllItems;

                                  // 1. Update the default assignees bucket so any NEW
                                  //    items created via the composer inherit it.
                                  setChecklistDefaultAssignees((prev) => {
                                    const set = new Set(prev);
                                    if (shouldRemove) set.delete(uid);
                                    else set.add(uid);
                                    return Array.from(set);
                                  });

                                  // 2. If there are existing items, also apply the
                                  //    add/remove across them so the bulk action is visible.
                                  if (checklist.length === 0) return;
                                  const next = checklist.map((c) => {
                                    const ids = new Set(c.assignee_ids ?? []);
                                    if (shouldRemove) ids.delete(uid);
                                    else ids.add(uid);
                                    return { ...c, assignee_ids: Array.from(ids) };
                                  });
                                  void persistChecklist(next);
                                }}
                                onClose={() => setChecklistBulkAssignOpen(false)}
                                alignRight
                              />
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {checklist.map((item) => {
                      const itemAssignees = item.assignee_ids ?? [];
                      return (
                        <div
                          key={item.id}
                          className="group relative flex items-center gap-2 rounded-md px-1 py-1 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                        >
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => {
                              const next = checklist.map((c) =>
                                c.id === item.id ? { ...c, done: !c.done } : c,
                              );
                              void persistChecklist(next);
                            }}
                            className="accent-purple-500 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={item.text}
                            onChange={(e) => {
                              const next = checklist.map((c) =>
                                c.id === item.id ? { ...c, text: e.target.value } : c,
                              );
                              setChecklist(next);
                            }}
                            onBlur={() => {
                              void persistChecklist(checklist);
                            }}
                            className={`flex-1 bg-transparent text-[13px] outline-none ${
                              item.done
                                ? 'line-through text-gray-400 dark:text-slate-500'
                                : 'text-gray-700 dark:text-slate-200'
                            }`}
                          />
                          {itemAssignees.length > 0 && (
                            <div className="flex -space-x-1.5">
                              {itemAssignees.slice(0, 3).map((uid) => {
                                const label =
                                  memberOptions.find((m) => m.id === uid)?.label ?? 'User';
                                return (
                                  <span
                                    key={uid}
                                    title={label}
                                    className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center border border-white dark:border-slate-900"
                                  >
                                    {label.charAt(0).toUpperCase()}
                                  </span>
                                );
                              })}
                              {itemAssignees.length > 3 && (
                                <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-[10px] font-bold flex items-center justify-center border border-white dark:border-slate-900">
                                  +{itemAssignees.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setChecklistAssigneeFor(checklistAssigneeFor === item.id ? null : item.id)}
                            className={`transition ${
                              itemAssignees.length > 0
                                ? 'text-purple-500'
                                : 'opacity-0 group-hover:opacity-100 text-gray-400 dark:text-slate-500 hover:text-purple-600'
                            }`}
                            title="Assign people"
                          >
                            <UserPlus size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = checklist.filter((c) => c.id !== item.id);
                              void persistChecklist(next);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition text-gray-300 dark:text-slate-600 hover:text-red-500"
                            aria-label="Remove item"
                          >
                            <Trash2 size={12} />
                          </button>
                          {checklistAssigneeFor === item.id && (
                            <AssigneePopover
                              memberOptions={memberOptions}
                              currentUserId={currentUserId}
                              selectedIds={itemAssignees}
                              onToggle={(uid) => {
                                const cur = item.assignee_ids ?? [];
                                const nextIds = cur.includes(uid)
                                  ? cur.filter((x) => x !== uid)
                                  : [...cur, uid];
                                const next = checklist.map((c) =>
                                  c.id === item.id ? { ...c, assignee_ids: nextIds } : c,
                                );
                                void persistChecklist(next);
                              }}
                              onClose={() => setChecklistAssigneeFor(null)}
                              alignRight
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Inline composer — always reachable via "+ Add item" / header + */}
                    {checklistDraftOpen ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const text = checklistDraft.trim();
                          if (!text) return;
                          const next: ChecklistItem[] = [
                            ...checklist,
                            {
                              id: `c-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                              text,
                              done: false,
                              // Inherit the header's "default assignees" so that picking
                              // people *before* adding items still works naturally.
                              assignee_ids: [...checklistDefaultAssignees],
                            },
                          ];
                          setChecklistDraft('');
                          void persistChecklist(next);
                          // keep the composer open so the user can quickly add more
                        }}
                        className="flex items-center gap-2 px-1 rounded-md border border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/20"
                      >
                        <Plus size={13} className="text-purple-500 shrink-0 ml-1" />
                        <input
                          autoFocus
                          type="text"
                          value={checklistDraft}
                          onChange={(e) => setChecklistDraft(e.target.value)}
                          placeholder="Item name — press Enter to add"
                          className="flex-1 h-8 bg-transparent text-[13px] outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setChecklistDraftOpen(false);
                              setChecklistDraft('');
                            }
                          }}
                        />
                        {checklistDraft.trim() && (
                          <button
                            type="submit"
                            className="h-6 px-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold flex items-center gap-1"
                            title="Save item (Enter)"
                          >
                            Save <Send size={10} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setChecklistDraftOpen(false);
                            setChecklistDraft('');
                          }}
                          className="h-6 w-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                          title="Close (Esc)"
                        >
                          <X size={12} />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setChecklistDraftOpen(true)}
                        className="w-full flex items-center gap-2 px-1 py-1.5 text-[13px] text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-md hover:bg-purple-50/40 dark:hover:bg-purple-900/10"
                      >
                        <Plus size={13} />
                        <span>Add item</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChecklistOpen(true);
                      setChecklistDraftOpen(true);
                    }}
                    className="mt-2 flex items-center gap-2 px-1 py-1 text-[13px] text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                  >
                    <Plus size={13} />
                    <span>Add checklist</span>
                  </button>
                </SectionRow>

                {/* --- Attach file --- */}
                <div className="relative pt-1">
                  <button
                    type="button"
                    onClick={() => setActivePopup((p) => (p === 'attach' ? null : 'attach'))}
                    className="flex items-center gap-2 py-2 px-1 text-[13px] text-gray-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400"
                  >
                    <Paperclip size={14} className="text-gray-400 dark:text-slate-500" />
                    <span>Attach file</span>
                  </button>
                  {activePopup === 'attach' && <AttachDropdown onClose={() => setActivePopup(null)} />}
                </div>
              </div>
            </div>
          </div>

          <div className="w-[420px] border-l border-gray-200 dark:border-slate-700 bg-gradient-to-b from-white dark:from-slate-900 via-white dark:via-slate-900 to-gray-50 dark:to-slate-900/80 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-950/30 p-2 rounded-lg">
                  <MessageSquare size={16} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-slate-100">Activity</h3>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500">
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors" title="Settings">
                  <Settings size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingComments && (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-slate-500 font-medium">
                  <div className="animate-spin mr-2">⊙</div> Loading comments...
                </div>
              )}
              {!loadingComments && comments.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-full mb-4">
                    <MessageSquare size={32} className="text-purple-300" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">No conversations yet</h4>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Start the discussion by adding a comment below</p>
                </div>
              )}
              <div className="space-y-4 p-5">
                {(() => {
                  // Group comments into { parent, replies[] } threads. Replies stay
                  // chronologically ordered; any reply whose parent is missing
                  // degrades gracefully into a top-level comment.
                  const topLevel = comments.filter((c) => !c.parent_comment_id);
                  const repliesByParent: Record<string, TaskCommentView[]> = {};
                  for (const c of comments) {
                    if (c.parent_comment_id) {
                      (repliesByParent[c.parent_comment_id] ||= []).push(c);
                    }
                  }
                  const orphanParents = new Set(topLevel.map((c) => c.id));
                  const orphans = comments.filter(
                    (c) => c.parent_comment_id && !orphanParents.has(c.parent_comment_id),
                  );
                  const renderList = [...topLevel, ...orphans];

                  const submitReply = async (parentId: string) => {
                    const text = replyText.trim();
                    if (!text) return;
                    setSendingReply(true);
                    try {
                      await onSendComment(text, undefined, parentId);
                      setReplyText('');
                      setReplyingTo(null);
                    } catch (err) {
                      toast({
                        title: 'Reply failed',
                        description: err instanceof Error ? err.message : 'Please retry.',
                      });
                    } finally {
                      setSendingReply(false);
                    }
                  };

                  return renderList.map((comment) => (
                    <CommentBlock
                      key={comment.id}
                      comment={comment}
                      replies={repliesByParent[comment.id] || []}
                      currentUserId={currentUserId}
                      reactionPickerFor={reactionPickerFor}
                      setReactionPickerFor={setReactionPickerFor}
                      onToggleReaction={onToggleReaction}
                      replyingTo={replyingTo}
                      setReplyingTo={(id) => {
                        setReplyingTo(id);
                        setReplyText('');
                      }}
                      replyText={replyText}
                      setReplyText={setReplyText}
                      sendingReply={sendingReply}
                      onSubmitReply={submitReply}
                    />
                  ));
                })()}
              </div>
            </div>

            <form className="border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-lg" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={commentText}
                    onChange={(e) => {
                      const el = e.currentTarget;
                      handleCommentInput(el.value, el.selectionStart ?? el.value.length);
                    }}
                    onKeyDown={(e) => {
                      if (!inlineMention || inlineMentionMatches.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setInlineMentionIndex((i) => (i + 1) % inlineMentionMatches.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setInlineMentionIndex((i) =>
                          (i - 1 + inlineMentionMatches.length) % inlineMentionMatches.length,
                        );
                      } else if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        applyInlineMention(inlineMentionMatches[inlineMentionIndex]);
                      } else if (e.key === 'Escape') {
                        setInlineMention(null);
                      }
                    }}
                    onBlur={() => {
                      // Delay so mousedown on suggestion can register first.
                      window.setTimeout(() => setInlineMention(null), 120);
                    }}
                    onPaste={handlePaste}
                    className="w-full px-4 py-3 text-sm bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 dark:focus:ring-purple-500/20 resize-none placeholder-gray-400 dark:placeholder-slate-500 text-gray-800 dark:text-slate-200 transition-all"
                    placeholder="Share your thoughts... ✨"
                    rows={2}
                  />
                  {inlineMention && inlineMentionMatches.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 py-1">
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                        Mention a member
                      </div>
                      {inlineMentionMatches.map((member, idx) => (
                        <button
                          key={member.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyInlineMention(member);
                          }}
                          onMouseEnter={() => setInlineMentionIndex(idx)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                            idx === inlineMentionIndex
                              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                              : 'text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-semibold">
                            {member.label[0]?.toUpperCase() ?? '?'}
                          </span>
                          <span className="truncate">{member.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="mt-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-800/60 p-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                        <span>Attachment</span>
                        <span>{attachments.length} file{attachments.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {attachments.map((file, idx) => {
                          const isImage = file.type.startsWith('image/');
                          const previewUrl = isImage ? URL.createObjectURL(file) : null;

                          return (
                            <div key={idx} className="min-w-[180px] max-w-[220px] rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                              <div className="flex items-center gap-2">
                                {isImage && previewUrl ? (
                                  <img
                                    src={previewUrl}
                                    alt={file.name}
                                    className="h-12 w-12 rounded-md border border-gray-200 dark:border-slate-700 object-cover"
                                  />
                                ) : (
                                  <FileText size={16} className="text-purple-500 flex-shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-gray-800 dark:text-slate-200">{file.name}</p>
                                  <p className="text-[10px] text-gray-500 dark:text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAttachment(idx)}
                                  className="rounded p-1 text-gray-400 dark:text-slate-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400"
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
                      className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
                      title="Attach file"
                    >
                      <Paperclip size={18} />
                    </button>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all relative"
                      title="Add emoji"
                    >
                      <Smile size={18} />
                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 w-72">
                          <div className="grid grid-cols-5 gap-1">
                            {commonEmojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleEmojiSelect(emoji)}
                                className="text-2xl hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg p-2 transition-all hover:scale-110"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                    <div ref={mentionPickerRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMentionPicker((v) => !v);
                          setMentionSearch('');
                        }}
                        className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
                        title="Mention someone"
                      >
                        <AtSign size={18} />
                      </button>
                      {showMentionPicker && (
                        <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl z-50">
                          <div className="p-2 border-b border-gray-100 dark:border-slate-800">
                            <input
                              type="text"
                              autoFocus
                              value={mentionSearch}
                              onChange={(e) => setMentionSearch(e.target.value)}
                              placeholder="Search member..."
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                          <div className="max-h-64 overflow-y-auto py-1">
                            {filteredMentionMembers.length === 0 && (
                              <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
                                No member found
                              </div>
                            )}
                            {filteredMentionMembers.map((member) => (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => insertMention(member)}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-left text-sm text-gray-700 dark:text-slate-300"
                              >
                                <span className="w-7 h-7 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-semibold">
                                  {member.label[0]?.toUpperCase() ?? '?'}
                                </span>
                                <span className="truncate">{member.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleImageAttachmentClick}
                      className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg text-gray-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
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
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </form>
          </div>
        </div>
        ) : activeTab === 'reminder' ? (
          <div className="flex-1 bg-white dark:bg-slate-900 px-8 py-6 flex flex-col">
            <div className="max-w-2xl space-y-5">
              <input
                type="text"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                placeholder="Reminder name…"
                className="w-full bg-transparent text-2xl font-semibold text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 caret-purple-500"
              />
              <textarea
                value={reminderBody}
                onChange={(e) => setReminderBody(e.target.value)}
                placeholder="Add a short description (optional)"
                rows={3}
                className="w-full resize-none rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-gray-700 dark:text-slate-200 outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-purple-500"
              />
              <div className="grid grid-cols-[auto_auto_1fr] items-center gap-3">
                <label className="text-[12px] font-medium text-gray-500 dark:text-slate-400">When</label>
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-2 text-sm text-gray-700 dark:text-slate-200 outline-none focus:border-purple-500"
                />
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="h-9 w-28 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-2 text-sm text-gray-700 dark:text-slate-200 outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const t = new Date();
                    setReminderDate(
                      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
                    );
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
                    setReminderDate(
                      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
                    );
                  }}
                  className="rounded border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = new Date();
                    t.setDate(t.getDate() + 7);
                    setReminderDate(
                      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
                    );
                  }}
                  className="rounded border border-gray-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Next week
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                We'll notify you <span className="font-medium">1 day before</span> and again on the <span className="font-medium">reminder date</span>.
                {assigneeIds.length > 0 && ' Assignees of this task will also receive both notifications.'}
              </p>
            </div>
            <div className="mt-auto flex justify-end pt-6">
              <button
                type="button"
                disabled={reminderSubmitting}
                onClick={async () => {
                  if (!onCreateReminder) {
                    toast({ title: 'Reminder service unavailable' });
                    return;
                  }
                  const titleTrim = reminderTitle.trim();
                  if (!titleTrim) {
                    toast({ title: 'Reminder needs a name' });
                    return;
                  }
                  if (!reminderDate) {
                    toast({ title: 'Pick a date', description: 'Choose when this reminder should fire.' });
                    return;
                  }
                  const timeStr = /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : '09:00';
                  const [hh, mm] = timeStr.split(':').map((n) => Number(n));
                  const [y, mo, d] = reminderDate.split('-').map((n) => Number(n));
                  const dueLocal = new Date(y, (mo || 1) - 1, d || 1, hh || 9, mm || 0, 0, 0);
                  if (Number.isNaN(dueLocal.getTime())) {
                    toast({ title: 'Invalid reminder date' });
                    return;
                  }
                  const notifyIds = Array.from(
                    new Set([...(currentUserId ? [currentUserId] : []), ...assigneeIds]),
                  );
                  setReminderSubmitting(true);
                  try {
                    await onCreateReminder({
                      title: `${titleTrim} (${task.title})`,
                      description: reminderBody.trim() || undefined,
                      dueDate: dueLocal.toISOString(),
                      notifyUserIds: notifyIds.length > 0 ? notifyIds : undefined,
                    });
                    setReminderTitle('');
                    setReminderBody('');
                    setReminderDate('');
                    setReminderTime('09:00');
                  } finally {
                    setReminderSubmitting(false);
                  }
                }}
                className="h-9 px-5 bg-purple-600 text-white rounded text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {reminderSubmitting ? 'Creating…' : 'Create Reminder'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white dark:bg-slate-900 p-8 flex flex-col justify-between">
            <div className="text-sm text-gray-500 dark:text-slate-400">
              {activeTab === 'doc' && 'Create Doc'}
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
      {activePopup === 'share' && (
        <ShareModal
          onClose={() => setActivePopup(null)}
          task={task}
          memberOptions={memberOptions}
          assigneeIds={assigneeIds}
          onInvite={async (memberId) => {
            if (assigneeIds.includes(memberId)) {
              toast({ title: 'Already shared', description: 'This member is already on the task.' });
              return;
            }
            const next = [...assigneeIds, memberId];
            setAssigneeIds(next);
            try {
              await onUpdateTask({ assigneeIds: next });
              toast({ title: 'Invited', description: 'Task shared successfully.' });
            } catch (err) {
              setAssigneeIds(assigneeIds);
              toast({
                title: 'Invite failed',
                description: err instanceof Error ? err.message : 'Could not share task.',
              });
            }
          }}
          onUpdatePermissions={async (payload) => {
            await onUpdateTask(payload);
          }}
        />
      )}
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
  <div className="bg-white dark:bg-slate-900 rounded-lg p-2.5 border border-gray-100 dark:border-slate-800 hover:border-purple-200 dark:hover:border-purple-800 hover:shadow-sm dark:hover:shadow-black/40 transition-all group">
    <div className="flex items-center gap-1.5 mb-2">
      <div className="text-gray-400 dark:text-slate-500 group-hover:text-purple-600 dark:hover:text-purple-400 transition-colors">{icon}</div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:hover:text-slate-100 transition-colors">{label}</label>
    </div>
    <div className="text-gray-800 dark:text-slate-200">{children}</div>
  </div>
);

const ActionButton = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <button className="flex items-center gap-2 px-3 py-1.5 text-gray-600 dark:text-slate-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-xs group transition-all rounded-lg border border-transparent hover:border-purple-200 dark:hover:border-purple-800 font-medium">
    <span className="text-gray-400 dark:text-slate-500 group-hover:text-purple-600 dark:hover:text-purple-400">{icon}</span>
    <span>{text}</span>
  </button>
);

/**
 * One comment bubble in the Activity panel. Handles:
 *  - Avatar + author name + timestamp
 *  - Content bubble + attachments
 *  - Seen-by line
 *  - Reaction chips (grouped by emoji with counts; your-reacted is highlighted)
 *  - Inline emoji-picker popover (toggle by clicking the +smile icon)
 *  - Reply composer (inline textarea when `replyingTo === comment.id`)
 *  - Nested reply list (rendered recursively with a left rail)
 */
const CommentBlock = ({
  comment,
  replies,
  currentUserId,
  reactionPickerFor,
  setReactionPickerFor,
  onToggleReaction,
  replyingTo,
  setReplyingTo,
  replyText,
  setReplyText,
  sendingReply,
  onSubmitReply,
  isReply = false,
}: {
  comment: TaskCommentView;
  replies: TaskCommentView[];
  currentUserId?: string;
  reactionPickerFor: string | null;
  setReactionPickerFor: (id: string | null) => void;
  onToggleReaction?: (commentId: string, emoji: string) => Promise<void> | void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyText: string;
  setReplyText: (t: string) => void;
  sendingReply: boolean;
  onSubmitReply: (parentId: string) => void;
  isReply?: boolean;
}) => {
  // Group reactions by emoji so we can render "👍 2" style chips.
  const reactionGroups = useMemo(() => {
    const groups: Record<string, { count: number; mine: boolean; names: string[] }> = {};
    for (const r of comment.reactions || []) {
      if (!groups[r.emoji]) groups[r.emoji] = { count: 0, mine: false, names: [] };
      groups[r.emoji].count += 1;
      if (r.user_id === currentUserId) groups[r.emoji].mine = true;
      if (r.user_name) groups[r.emoji].names.push(r.user_name);
    }
    return groups;
  }, [comment.reactions, currentUserId]);

  const hasReactions = Object.keys(reactionGroups).length > 0;
  const isReplyOpen = replyingTo === comment.id;
  const isPickerOpen = reactionPickerFor === comment.id;

  return (
    <div className={`group ${isReply ? 'pl-8 border-l-2 border-gray-100 dark:border-slate-800/70 ml-4' : ''}`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <div
            className={`${isReply ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'} rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold`}
          >
            {(comment.author_name || 'U').charAt(0).toUpperCase()}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {comment.author_name || 'Anonymous'}
            </p>
            <time className="text-xs text-gray-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(comment.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-3 shadow-xs hover:shadow-sm dark:hover:shadow-black/40 transition-shadow">
            <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed break-words whitespace-pre-wrap">
              {comment.content || '📎 Image attached'}
            </p>
            {comment.attachments?.length ? (
              <div className="mt-3 grid gap-2">
                {comment.attachments.map((attachment, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60"
                  >
                    {attachment.mimeType.startsWith('image/') ? (
                      <img
                        src={attachment.dataUrl}
                        alt={attachment.filename}
                        className="w-full h-auto object-cover"
                      />
                    ) : (
                      <div className="flex items-center gap-2 p-3 text-sm text-gray-700 dark:text-slate-300">
                        <FileText size={16} />
                        <span>{attachment.filename}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Reaction chips */}
          {hasReactions && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(reactionGroups).map(([emoji, info]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction?.(comment.id, emoji)}
                  title={info.names.length ? info.names.join(', ') : undefined}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[12px] transition ${
                    info.mine
                      ? 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200'
                      : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-600'
                  }`}
                >
                  <span className="text-[13px] leading-none">{emoji}</span>
                  <span className="font-semibold">{info.count}</span>
                </button>
              ))}
            </div>
          )}

          {comment.read_by && comment.read_by.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-slate-400">
              <span className="font-medium text-gray-400 dark:text-slate-500">Seen by </span>
              {comment.read_by.map((r) => r.name || r.user_id).join(', ')}
            </p>
          )}

          {/* Action row — always visible so emoji/reply are discoverable. */}
          <div className="relative flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => setReactionPickerFor(isPickerOpen ? null : comment.id)}
              className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors font-medium"
              title="Add reaction"
            >
              <Smile size={13} />
              <span>React</span>
            </button>
            <button
              type="button"
              onClick={() =>
                isReplyOpen ? setReplyingTo(null) : setReplyingTo(comment.id)
              }
              className={`inline-flex items-center gap-1 text-xs transition-colors font-medium ${
                isReplyOpen
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-gray-400 dark:text-slate-500 hover:text-purple-600 dark:hover:text-purple-400'
              }`}
              title="Reply"
            >
              <MessageSquare size={13} />
              <span>Reply</span>
            </button>

            {/* Emoji quick-picker */}
            {isPickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setReactionPickerFor(null)}
                />
                <div className="absolute left-0 top-6 z-50 flex gap-1 p-1.5 rounded-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                  {REACTION_EMOJIS.map((emoji) => {
                    const mine = reactionGroups[emoji]?.mine;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          void onToggleReaction?.(comment.id, emoji);
                          setReactionPickerFor(null);
                        }}
                        className={`w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition text-[17px] leading-none flex items-center justify-center ${
                          mine ? 'bg-purple-50 dark:bg-purple-900/30' : ''
                        }`}
                        title={mine ? 'Remove reaction' : `React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Inline reply composer */}
          {isReplyOpen && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSubmitReply(comment.id);
              }}
              className="mt-2 flex items-start gap-2 rounded-lg border border-purple-300 dark:border-purple-700 bg-purple-50/40 dark:bg-purple-900/15 p-2"
            >
              <textarea
                autoFocus
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setReplyingTo(null);
                  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    onSubmitReply(comment.id);
                  }
                }}
                placeholder={`Reply to ${comment.author_name || 'this comment'}...`}
                className="flex-1 resize-none bg-transparent text-[13px] outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="h-7 px-2.5 rounded-md bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <Send size={11} />
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="h-7 px-2.5 rounded-md border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 text-[11px] hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Nested replies — rendered as a flat second level to match Slack/Linear. */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-3">
              {replies.map((reply) => (
                <CommentBlock
                  key={reply.id}
                  comment={reply}
                  replies={[]}
                  currentUserId={currentUserId}
                  reactionPickerFor={reactionPickerFor}
                  setReactionPickerFor={setReactionPickerFor}
                  onToggleReaction={onToggleReaction}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  sendingReply={sendingReply}
                  onSubmitReply={onSubmitReply}
                  isReply
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Collapsible row header for the Subtask / Checklist sections — styled after ClickUp's
 * single-line headers ("▾ Add subtask  [+]") so the actions panel stays compact.
 */
const SectionRow = ({
  open,
  onToggle,
  label,
  count,
  trailing,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  count?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="mb-2">
    <div className="flex items-center gap-1 px-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 flex items-center gap-2 py-1.5 text-left text-[13px] font-semibold text-gray-800 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400"
      >
        <ChevronDown
          size={13}
          className={`text-gray-400 dark:text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span>{label}</span>
        {count && (
          <span className="ml-1 rounded-full bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:text-slate-400">
            {count}
          </span>
        )}
      </button>
      {trailing}
    </div>
    {open && <div className="pt-1">{children}</div>}
  </div>
);

const IconBtn = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <button
    type="button"
    title={title}
    className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400"
  >
    {children}
  </button>
);

/** Toolbar icon button inside the subtask composer — supports an "active" (popover open) state. */
const ComposerIconBtn = ({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`h-7 w-7 flex items-center justify-center rounded-md transition ${
      active
        ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-700'
        : 'border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400'
    }`}
  >
    {children}
  </button>
);

/**
 * Base popover wrapper — rendered into a portal with fixed positioning so it stays
 * visible even when its trigger lives inside a scrolling / clipping ancestor.
 */
const Popover = ({
  children,
  onClose,
  alignRight,
  width = 260,
}: {
  children: React.ReactNode;
  onClose: () => void;
  alignRight?: boolean;
  width?: number;
}) => {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const update = () => {
      const parent = anchor.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const top = rect.bottom + 6;
      const left = alignRight ? Math.max(8, rect.right - width) : rect.left;
      setCoords({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [alignRight, width]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* A zero-size anchor used to locate the trigger's bounding box. */}
      <span ref={anchorRef} className="sr-only" aria-hidden />
      {coords &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={onClose} />
            <div
              className="fixed z-[61] rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
              style={{ top: coords.top, left: coords.left, width }}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </div>
          </>,
          document.body,
        )}
    </>
  );
};

const TypePopover = ({
  value,
  onSelect,
  onClose,
  alignRight,
}: {
  value: 'task' | 'milestone' | 'form' | 'meeting' | 'process' | 'project';
  onSelect: (v: 'task' | 'milestone' | 'form' | 'meeting' | 'process' | 'project') => void;
  onClose: () => void;
  alignRight?: boolean;
}) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () => TYPE_OPTIONS.filter((opt) => opt.label.toLowerCase().includes(q.trim().toLowerCase())),
    [q],
  );
  return (
    <Popover onClose={onClose} alignRight={alignRight}>
      <div className="p-2 border-b border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-2 rounded-md border border-purple-300 dark:border-purple-700 px-2 h-8">
          <Search size={12} className="text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find type (e.g. Milestone)"
            className="flex-1 bg-transparent text-[12px] outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-gray-400 dark:text-slate-500 uppercase">Create</p>
        {filtered.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200"
            >
              <span className="w-4 h-4 flex items-center justify-center">
                <Box size={13} className={selected ? 'text-purple-600' : 'text-gray-400'} />
              </span>
              <span className={`flex-1 ${selected ? 'font-semibold' : ''}`}>{opt.label}</span>
              {opt.hint && <span className="text-[11px] text-gray-400 dark:text-slate-500">({opt.hint})</span>}
              {selected && <Check size={13} className="text-purple-600" />}
            </button>
          );
        })}
      </div>
    </Popover>
  );
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const PriorityPopover = ({
  value,
  onSelect,
  onClose,
  alignRight,
}: {
  value: TaskPriority;
  onSelect: (v: TaskPriority) => void;
  onClose: () => void;
  alignRight?: boolean;
}) => (
  <Popover onClose={onClose} alignRight={alignRight} width={200}>
    {PRIORITY_OPTIONS.map((opt) => {
      const selected = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200"
        >
          <FlagIcon size={13} className={PRIORITY_COLORS[opt.value]} />
          <span className={`flex-1 ${selected ? 'font-semibold' : ''}`}>{opt.label}</span>
          {selected && <Check size={13} className="text-purple-600" />}
        </button>
      );
    })}
  </Popover>
);

const AssigneePopover = ({
  memberOptions,
  currentUserId,
  selectedIds,
  onToggle,
  onClose,
  alignRight,
}: {
  memberOptions: { id: string; label: string }[];
  currentUserId?: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  alignRight?: boolean;
}) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return memberOptions;
    return memberOptions.filter((m) => m.label.toLowerCase().includes(qq));
  }, [q, memberOptions]);
  const me = currentUserId ? memberOptions.find((m) => m.id === currentUserId) : undefined;
  return (
    <Popover onClose={onClose} alignRight={alignRight} width={260}>
      <div className="p-2 border-b border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-slate-700 px-2 h-8">
          <Search size={12} className="text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or enter email..."
            className="flex-1 bg-transparent text-[12px] outline-none text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <p className="px-3 py-3 text-[12px] text-gray-400 dark:text-slate-500">No people match.</p>
        )}
        {!q && me && (
          <>
            <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold tracking-wide text-gray-400 dark:text-slate-500 uppercase">People</p>
            <AssigneeRow
              label="Me"
              userId={me.id}
              selected={selectedIds.includes(me.id)}
              onClick={() => onToggle(me.id)}
            />
          </>
        )}
        {filtered
          .filter((m) => !(!q && me && m.id === me.id))
          .map((m) => (
            <AssigneeRow
              key={m.id}
              label={m.label}
              userId={m.id}
              selected={selectedIds.includes(m.id)}
              onClick={() => onToggle(m.id)}
            />
          ))}
      </div>
    </Popover>
  );
};

const AssigneeRow = ({
  label,
  userId,
  selected,
  onClick,
}: {
  label: string;
  userId: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 ${
      selected ? 'bg-purple-50/40 dark:bg-purple-900/20' : ''
    }`}
  >
    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white text-[11px] font-bold flex items-center justify-center">
      {label.charAt(0).toUpperCase()}
    </span>
    <span className="flex-1 truncate">{label}</span>
    {selected && <Check size={13} className="text-purple-600" />}
  </button>
);

/**
 * ClickUp-style date popover with Start/Due tabs, quick presets, and a simple
 * calendar grid for the current month. Only drives yyyy-mm-dd strings.
 */
const DatePopover = ({
  startDate,
  dueDate,
  onChange,
  onClose,
}: {
  startDate: string;
  dueDate: string;
  onChange: (next: { startDate: string; dueDate: string }) => void;
  onClose: () => void;
}) => {
  const [tab, setTab] = useState<'start' | 'due'>('due');
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth());

  const toIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const setActiveDate = (iso: string) => {
    if (tab === 'start') onChange({ startDate: iso, dueDate });
    else onChange({ startDate, dueDate: iso });
  };

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const weekend = new Date();
  weekend.setDate(today.getDate() + ((6 - today.getDay()) % 7 || 6));
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const twoWeeks = new Date();
  twoWeeks.setDate(today.getDate() + 14);
  const fourWeeks = new Date();
  fourWeeks.setDate(today.getDate() + 28);

  const presets: Array<{ label: string; hint: string; date: Date }> = [
    { label: 'Today', hint: today.toLocaleDateString(undefined, { weekday: 'short' }), date: today },
    { label: 'Tomorrow', hint: tomorrow.toLocaleDateString(undefined, { weekday: 'short' }), date: tomorrow },
    { label: 'This weekend', hint: 'Sat', date: weekend },
    { label: 'Next week', hint: nextWeek.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), date: nextWeek },
    { label: '2 weeks', hint: twoWeeks.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), date: twoWeeks },
    { label: '4 weeks', hint: fourWeeks.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), date: fourWeeks },
  ];

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const firstWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const weeks: Array<Array<number | null>> = [];
  let row: Array<number | null> = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(d);
    if (row.length === 7) {
      weeks.push(row);
      row = [];
    }
  }
  if (row.length > 0) weeks.push([...row, ...Array(7 - row.length).fill(null)]);

  const selectedIso = tab === 'start' ? startDate : dueDate;
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Popover onClose={onClose} alignRight width={520}>
      <div className="flex items-center gap-2 p-2 border-b border-gray-100 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab('start')}
          className={`flex-1 flex items-center gap-2 h-8 px-2 rounded-md text-[12px] border ${
            tab === 'start'
              ? 'border-purple-400 text-purple-600 bg-purple-50 dark:bg-purple-900/30'
              : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'
          }`}
        >
          <CalendarIcon size={12} />
          <span>{startDate || 'Start date'}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('due')}
          className={`flex-1 flex items-center gap-2 h-8 px-2 rounded-md text-[12px] border ${
            tab === 'due'
              ? 'border-purple-400 text-purple-600 bg-purple-50 dark:bg-purple-900/30'
              : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'
          }`}
        >
          <CalendarIcon size={12} />
          <span>{dueDate || 'Due date'}</span>
        </button>
      </div>

      <div className="grid grid-cols-[180px,1fr]">
        <div className="border-r border-gray-100 dark:border-slate-800 py-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setActiveDate(toIso(p.date))}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              <span>{p.label}</span>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">{p.hint}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                startDate: tab === 'start' ? '' : startDate,
                dueDate: tab === 'due' ? '' : dueDate,
              })
            }
            className="w-full text-left px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Clear {tab} date
          </button>
        </div>
        <div className="p-2">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[12px] font-semibold text-gray-700 dark:text-slate-200">{monthLabel}</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear(viewYear - 1);
                  } else {
                    setViewMonth(viewMonth - 1);
                  }
                }}
                className="h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
                aria-label="Previous month"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear(viewYear + 1);
                  } else {
                    setViewMonth(viewMonth + 1);
                  }
                }}
                className="h-6 w-6 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-[12px]">
            {weeks.flat().map((day, idx) => {
              if (day === null) return <span key={idx} className="h-7" />;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday =
                viewYear === today.getFullYear() &&
                viewMonth === today.getMonth() &&
                day === today.getDate();
              const isSelected = iso === selectedIso;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveDate(iso)}
                  className={`h-7 rounded-full transition ${
                    isSelected
                      ? 'bg-purple-600 text-white font-semibold'
                      : isToday
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 font-semibold'
                        : 'text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Popover>
  );
};

interface ShareModalProps {
  onClose: () => void;
  task: Task;
  memberOptions: { id: string; label: string }[];
  assigneeIds: string[];
  /** Adds a user as an assignee (legacy behavior — still invoked when no role override). */
  onInvite: (memberId: string) => Promise<void>;
  /** Persist permission changes back to the task (default permission, collaborators, privacy). */
  onUpdatePermissions: (payload: {
    defaultPermission?: 'full_edit' | 'edit' | 'comment' | 'view';
    collaborators?: Array<{ userId: string; role: 'full_edit' | 'edit' | 'comment' | 'view' }>;
    isPrivate?: boolean;
  }) => Promise<void>;
}

/** Permission options shown in dropdowns throughout the Share dialog. */
const TASK_PERMISSION_OPTIONS: Array<{
  value: 'full_edit' | 'edit' | 'comment' | 'view';
  label: string;
  description: string;
}> = [
  { value: 'full_edit', label: 'Full edit', description: 'Can edit and delete.' },
  { value: 'edit', label: 'Edit', description: "Can't create subtasks and delete." },
  { value: 'comment', label: 'Comment', description: 'Assignees can reassign and edit status.' },
  { value: 'view', label: 'View only', description: "Can't comment or edit." },
];

const permissionLabel = (value: string) =>
  TASK_PERMISSION_OPTIONS.find((o) => o.value === value)?.label ?? 'Full edit';

const ShareModal = ({
  onClose,
  task,
  memberOptions,
  assigneeIds,
  onInvite,
  onUpdatePermissions,
}: ShareModalProps) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ id: string; label: string } | null>(null);
  const [inviteRole, setInviteRole] = useState<'full_edit' | 'edit' | 'comment' | 'view'>(
    (task.default_permission as 'full_edit' | 'edit' | 'comment' | 'view') || 'full_edit',
  );
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Live local view of collaborators so drop-downs feel instant; we save to server on change. */
  const [collaborators, setCollaborators] = useState<
    Array<{ user_id: string; role: 'full_edit' | 'edit' | 'comment' | 'view' }>
  >(
    (task.collaborators ?? []).map((c) => ({
      user_id: c.user_id,
      role: c.role as 'full_edit' | 'edit' | 'comment' | 'view',
    })),
  );
  const [defaultPermission, setDefaultPermission] = useState<
    'full_edit' | 'edit' | 'comment' | 'view'
  >((task.default_permission as 'full_edit' | 'edit' | 'comment' | 'view') || 'full_edit');
  const [isPrivate, setIsPrivate] = useState(Boolean(task.is_private));
  /** Which dropdown is open: 'default', 'invite', or a collaborator's user_id. */
  const [permMenu, setPermMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const taskUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?task=${encodeURIComponent(task.id)}`
    : `/?task=${encodeURIComponent(task.id)}`;

  // Who's already "on" the task — used to dim them in the search results.
  const sharedUserIds = useMemo(
    () => new Set<string>([...assigneeIds, ...collaborators.map((c) => c.user_id)]),
    [assigneeIds, collaborators],
  );

  const filtered = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const q = raw.replace(/[^a-z0-9@.]/g, '');
    const pool = memberOptions.map((m) => ({
      ...m,
      alreadyShared: sharedUserIds.has(m.id),
    }));
    const matching = q
      ? pool.filter((m) => {
          const label = m.label.toLowerCase();
          const compact = label.replace(/[^a-z0-9@.]/g, '');
          return label.includes(raw) || compact.includes(q);
        })
      : pool;
    return matching
      .sort((a, b) => Number(a.alreadyShared) - Number(b.alreadyShared))
      .slice(0, 8);
  }, [query, memberOptions, sharedUserIds]);

  const handleInvite = async () => {
    if (!selectedMember) {
      toast({ title: 'Select a member', description: 'Pick a member from the list to invite.' });
      return;
    }
    setInviting(true);
    try {
      if (inviteRole === 'full_edit') {
        // "Full edit" mirrors the old behavior — promote straight to assignee.
        await onInvite(selectedMember.id);
      } else {
        // Everything else is stored as an explicit collaborator with a sub-edit role.
        const next = [...collaborators, { user_id: selectedMember.id, role: inviteRole }];
        setCollaborators(next);
        await onUpdatePermissions({
          collaborators: next.map((c) => ({ userId: c.user_id, role: c.role })),
        });
        toast({
          title: 'Invited',
          description: `${selectedMember.label} added as ${permissionLabel(inviteRole)}.`,
        });
      }
      setSelectedMember(null);
      setQuery('');
    } catch (err) {
      toast({
        title: 'Invite failed',
        description: err instanceof Error ? err.message : 'Could not share task.',
      });
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(taskUrl);
      setCopied(true);
      toast({ title: 'Link copied', description: 'Task link copied to clipboard.' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Unable to copy link.' });
    }
  };

  const handleChangeCollaboratorRole = async (
    userId: string,
    role: 'full_edit' | 'edit' | 'comment' | 'view',
  ) => {
    const next = collaborators.map((c) => (c.user_id === userId ? { ...c, role } : c));
    setCollaborators(next);
    setPermMenu(null);
    setBusy(true);
    try {
      await onUpdatePermissions({
        collaborators: next.map((c) => ({ userId: c.user_id, role: c.role })),
      });
    } catch (err) {
      toast({
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Please retry.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    const next = collaborators.filter((c) => c.user_id !== userId);
    setCollaborators(next);
    setBusy(true);
    try {
      await onUpdatePermissions({
        collaborators: next.map((c) => ({ userId: c.user_id, role: c.role })),
      });
    } catch (err) {
      toast({
        title: 'Could not remove',
        description: err instanceof Error ? err.message : 'Please retry.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleChangeDefaultPermission = async (value: 'full_edit' | 'edit' | 'comment' | 'view') => {
    setDefaultPermission(value);
    setPermMenu(null);
    setBusy(true);
    try {
      await onUpdatePermissions({ defaultPermission: value });
    } catch (err) {
      toast({
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Please retry.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePrivacy = async () => {
    const next = !isPrivate;
    setIsPrivate(next);
    setBusy(true);
    try {
      await onUpdatePermissions({ isPrivate: next });
      toast({
        title: next ? 'Task is now private' : 'Task is public',
        description: next
          ? 'Only people you share with can see it.'
          : 'Anyone in the workspace can see it.',
      });
    } catch (err) {
      toast({
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Please retry.',
      });
    } finally {
      setBusy(false);
    }
  };

  /** Pull a display label for any user id (assignee or collaborator). */
  const labelFor = (userId: string) =>
    memberOptions.find((m) => m.id === userId)?.label ?? userId;

  // "Share with" rows: assignees first (non-removable, full edit), then explicit collaborators.
  const assigneeRows = assigneeIds.map((uid) => ({
    userId: uid,
    role: 'full_edit' as const,
    removable: false,
    kind: 'assignee' as const,
  }));
  const collaboratorRows = collaborators.map((c) => ({
    userId: c.user_id,
    role: c.role,
    removable: true,
    kind: 'collaborator' as const,
  }));
  const shareRows = [...assigneeRows, ...collaboratorRows];

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col border border-gray-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-bold text-gray-900 dark:text-slate-100">Share this task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
            <span>Sharing task</span>
            <span className="font-semibold text-gray-700 dark:text-slate-200">
              <Box size={12} className="inline mr-1" />
              {task.title}
            </span>
          </div>

          {/* Invite row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                value={selectedMember ? selectedMember.label : query}
                onChange={(e) => {
                  let next = e.target.value;
                  if (next.startsWith('@')) next = next.slice(1);
                  setQuery(next);
                  if (selectedMember) setSelectedMember(null);
                  setFocused(true);
                }}
                onFocus={() => setFocused(true)}
                onClick={() => setFocused(true)}
                onBlur={() => window.setTimeout(() => setFocused(false), 200)}
                className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950/40 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 text-gray-700 dark:text-slate-200"
                placeholder="Invite by name or email"
              />
              {focused && !selectedMember && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl z-[70]">
                  {filtered.length === 0 && (
                    <div className="px-3 py-3 text-xs text-gray-400 dark:text-slate-500 text-center">
                      {memberOptions.length === 0 ? 'No members loaded yet' : 'No matching member'}
                    </div>
                  )}
                  {filtered.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      disabled={member.alreadyShared}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (member.alreadyShared) return;
                        setSelectedMember({ id: member.id, label: member.label });
                        setQuery('');
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                        member.alreadyShared
                          ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed bg-gray-50 dark:bg-slate-900/60'
                          : 'text-gray-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-semibold ${
                          member.alreadyShared ? 'bg-gray-300 dark:bg-slate-700' : 'bg-purple-500'
                        }`}
                      >
                        {member.label[0]?.toUpperCase() ?? '?'}
                      </span>
                      <span className="truncate flex-1">{member.label}</span>
                      {member.alreadyShared && (
                        <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 whitespace-nowrap">
                          already shared
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pre-invite permission picker — determines the role we create the collaborator with. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPermMenu(permMenu === 'invite' ? null : 'invite')}
                className="h-full px-2.5 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold bg-white dark:bg-slate-950/40 text-gray-700 dark:text-slate-200 inline-flex items-center gap-1"
              >
                {permissionLabel(inviteRole)}
                <ChevronDown size={12} />
              </button>
              {permMenu === 'invite' && (
                <PermissionMenu
                  value={inviteRole}
                  onSelect={(v) => {
                    setInviteRole(v);
                    setPermMenu(null);
                  }}
                  onClose={() => setPermMenu(null)}
                />
              )}
            </div>

            <button
              type="button"
              onClick={handleInvite}
              disabled={!selectedMember || inviting}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </div>

          {/* Private link + default permission */}
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                <Link size={16} /> Private link
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="border border-gray-200 dark:border-slate-700 px-3 py-1 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-1 text-gray-700 dark:text-slate-300"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <div className="flex justify-between items-center relative">
              <span className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                <User size={16} /> Default permission
              </span>
              <button
                type="button"
                onClick={() => setPermMenu(permMenu === 'default' ? null : 'default')}
                disabled={busy}
                className="text-xs font-semibold bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 text-gray-700 dark:text-slate-200"
              >
                {permissionLabel(defaultPermission)}
                <ChevronDown size={12} />
              </button>
              {permMenu === 'default' && (
                <PermissionMenu
                  value={defaultPermission}
                  onSelect={handleChangeDefaultPermission}
                  onClose={() => setPermMenu(null)}
                  anchor="right"
                />
              )}
            </div>
          </div>

          {/* Share-with list */}
          {shareRows.length > 0 && (
            <div className="border-t border-gray-100 dark:border-slate-800 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
                Share with
              </p>
              <div className="space-y-1">
                {shareRows.map((row) => {
                  const label = labelFor(row.userId);
                  return (
                    <div
                      key={`${row.kind}-${row.userId}`}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-white flex items-center justify-center text-xs font-semibold">
                        {label[0]?.toUpperCase() ?? '?'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-slate-200 truncate">
                          {label}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-slate-500">
                          {row.kind === 'assignee' ? 'Assignee' : 'Shared'}
                        </p>
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          disabled={row.kind === 'assignee'}
                          onClick={() =>
                            setPermMenu(permMenu === row.userId ? null : row.userId)
                          }
                          className={`text-xs font-semibold border rounded-lg px-2.5 py-1 inline-flex items-center gap-1 ${
                            row.kind === 'assignee'
                              ? 'bg-gray-100 dark:bg-slate-800/60 border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-white dark:bg-slate-950/40 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {permissionLabel(row.role)}
                          {row.kind !== 'assignee' && <ChevronDown size={12} />}
                        </button>
                        {permMenu === row.userId && row.kind === 'collaborator' && (
                          <PermissionMenu
                            value={row.role}
                            onSelect={(v) => handleChangeCollaboratorRole(row.userId, v)}
                            onClose={() => setPermMenu(null)}
                            anchor="right"
                          />
                        )}
                      </div>
                      {row.removable && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCollaborator(row.userId)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                          title="Remove access"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleTogglePrivacy}
            disabled={busy}
            className="w-full mt-2 flex items-center justify-center gap-2 border border-gray-200 dark:border-slate-700 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200"
          >
            {isPrivate ? <Globe size={14} /> : <Lock size={14} />}
            {isPrivate ? 'Make Public' : 'Make Private'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Drop-down panel with the four permission levels + short description,
 * used by every role picker in the Share dialog.
 */
const PermissionMenu = ({
  value,
  onSelect,
  onClose,
  anchor = 'right',
}: {
  value: 'full_edit' | 'edit' | 'comment' | 'view';
  onSelect: (v: 'full_edit' | 'edit' | 'comment' | 'view') => void;
  onClose: () => void;
  anchor?: 'left' | 'right';
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className={`absolute top-full mt-1 z-[71] w-64 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden ${
          anchor === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {TASK_PERMISSION_OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-800 ${
                selected ? 'bg-purple-50/60 dark:bg-purple-900/20' : ''
              }`}
            >
              <span className="w-4 pt-0.5">
                {selected && <Check size={12} className="text-purple-600" />}
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-gray-800 dark:text-slate-200">
                  {opt.label}
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-slate-400 leading-tight mt-0.5">
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
        <div className="border-t border-gray-100 dark:border-slate-800 px-3 py-2 text-[11px] text-gray-400 dark:text-slate-500">
          <a href="#" className="hover:underline">
            Learn more
          </a>{' '}
          about permissions.
        </div>
      </div>
    </>
  );
};

const TimeTrackPopup = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[60] pointer-events-none">
    <div className="pointer-events-auto absolute top-24 left-1/2 -translate-x-1/2 w-80 bg-white dark:bg-slate-900 shadow-2xl border rounded-lg p-4">
      <div className="flex justify-between mb-4">
        <span className="text-xs font-bold">Time on this task</span>
        <span className="text-xs text-gray-400 dark:text-slate-500 font-bold">0h</span>
      </div>
      <div className="relative mb-4">
        <input className="w-full bg-white dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-xs pr-10 text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-purple-400 outline-none" placeholder="Enter time (ex: 3h 20m) or start timer" />
        <Play size={16} fill="currentColor" className="absolute right-3 top-2.5 text-gray-300 dark:text-slate-600" />
      </div>
      <div className="space-y-2 text-xs text-gray-500 dark:text-slate-400">
        <div className="flex items-center gap-2"><Clock size={14} /> Tue, Apr 14 4:48 pm — 4:48 pm</div>
        <div className="flex items-center gap-2"><MessageSquare size={14} /> Notes</div>
        <div className="flex items-center gap-2"><Tag size={14} /> Add tags</div>
      </div>
      <div className="mt-6 flex justify-end items-center border-t pt-3 gap-2">
        <button className="text-xs text-gray-500 dark:text-slate-400 px-3" onClick={onClose}>Cancel</button>
        <button className="bg-purple-600 text-white text-xs px-4 py-1.5 rounded font-bold flex items-center gap-1"><Save size={12} /> Save</button>
      </div>
    </div>
  </div>
);

const AttachDropdown = ({ onClose }: { onClose: () => void }) => (
  <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-slate-900 shadow-xl border rounded-lg z-20 py-1 flex flex-col">
    <div className="px-3 py-2 text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold border-b mb-1">Upload from</div>
    {[
      { icon: <Upload size={14} />, label: 'Upload file' },
      { icon: <FileText size={14} />, label: 'New Document' },
      { icon: <Download size={14} />, label: 'Dropbox' },
      { icon: <Globe size={14} />, label: 'Google Drive' },
    ].map((item, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-gray-700 dark:text-slate-300" onClick={onClose}>
        {item.icon} <span>{item.label}</span>
      </div>
    ))}
  </div>
);
