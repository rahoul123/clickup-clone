import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  FileText,
  FolderKanban,
  ListChecks,
  Loader2,
  Search,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { List, Space, WorkspaceDoc } from '@/types';

type TaskSearchHit = {
  id: string;
  title: string;
  status?: string;
  list_id: string;
  list_name?: string | null;
  space_name?: string | null;
};

type MemberOption = { id: string; label: string };

interface GlobalSearchProps {
  workspaceId: string | null;
  spaces: Space[];
  lists: List[];
  docs: WorkspaceDoc[];
  members: MemberOption[];
  onOpenTask: (taskId: string) => void;
  onOpenList: (listId: string) => void;
  onOpenSpace: (spaceId: string, spaceName: string) => void;
  onOpenDocs: () => void;
  onOpenTeamMembers: () => void;
}

const MAX_PER_GROUP = 5;

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? navigator.userAgent);
}

export function GlobalSearch({
  workspaceId,
  spaces,
  lists,
  docs,
  members,
  onOpenTask,
  onOpenList,
  onOpenSpace,
  onOpenDocs,
  onOpenTeamMembers,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [taskHits, setTaskHits] = useState<TaskSearchHit[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shortcutLabel = useMemo(() => (isMac() ? '⌘K' : 'Ctrl+K'), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcut =
        (event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K' || event.key === 'j' || event.key === 'J');
      if (isShortcut) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
      if (event.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    if (!debounced || !workspaceId) {
      setTaskHits([]);
      setLoadingTasks(false);
      return () => {
        cancelled = true;
      };
    }
    setLoadingTasks(true);
    api.app
      .searchTasks(workspaceId, debounced)
      .then((data: { tasks?: TaskSearchHit[] }) => {
        if (cancelled) return;
        setTaskHits((data?.tasks ?? []).slice(0, 15));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Global search failed', error);
        setTaskHits([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingTasks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, workspaceId]);

  const spaceMatches = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    return spaces
      .filter((s) => s.workspace_id === workspaceId && s.name.toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP);
  }, [debounced, spaces, workspaceId]);

  const spaceById = useMemo(() => {
    const map = new Map<string, Space>();
    spaces.forEach((s) => map.set(s.id, s));
    return map;
  }, [spaces]);

  const listMatches = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    return lists
      .filter((l) => {
        const space = spaceById.get(l.space_id);
        if (!space || space.workspace_id !== workspaceId) return false;
        return l.name.toLowerCase().includes(q);
      })
      .slice(0, MAX_PER_GROUP);
  }, [debounced, lists, spaceById, workspaceId]);

  const docMatches = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    return docs
      .filter((d) => d.workspace_id === workspaceId && (d.title?.toLowerCase().includes(q) || d.file_name?.toLowerCase().includes(q)))
      .slice(0, MAX_PER_GROUP);
  }, [debounced, docs, workspaceId]);

  const memberMatches = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    return members.filter((m) => m.label.toLowerCase().includes(q)).slice(0, MAX_PER_GROUP);
  }, [debounced, members]);

  type FlatItem =
    | { kind: 'task'; data: TaskSearchHit }
    | { kind: 'list'; data: List }
    | { kind: 'space'; data: Space }
    | { kind: 'doc'; data: WorkspaceDoc }
    | { kind: 'member'; data: MemberOption };

  const flatItems = useMemo<FlatItem[]>(() => {
    const arr: FlatItem[] = [];
    taskHits.forEach((t) => arr.push({ kind: 'task', data: t }));
    listMatches.forEach((l) => arr.push({ kind: 'list', data: l }));
    spaceMatches.forEach((s) => arr.push({ kind: 'space', data: s }));
    docMatches.forEach((d) => arr.push({ kind: 'doc', data: d }));
    memberMatches.forEach((m) => arr.push({ kind: 'member', data: m }));
    return arr;
  }, [taskHits, listMatches, spaceMatches, docMatches, memberMatches]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, flatItems.length]);

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setQuery('');
    setDebounced('');
  }, []);

  const handleSelect = useCallback(
    (item: FlatItem) => {
      switch (item.kind) {
        case 'task':
          onOpenTask(item.data.id);
          break;
        case 'list':
          onOpenList(item.data.id);
          break;
        case 'space':
          onOpenSpace(item.data.id, item.data.name);
          break;
        case 'doc':
          onOpenDocs();
          break;
        case 'member':
          onOpenTeamMembers();
          break;
      }
      closeAndReset();
    },
    [onOpenTask, onOpenList, onOpenSpace, onOpenDocs, onOpenTeamMembers, closeAndReset]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      const item = flatItems[activeIndex];
      if (item) {
        event.preventDefault();
        handleSelect(item);
      }
    }
  };

  const showDropdown = open && (debounced.length > 0 || loadingTasks);
  const hasAnyResults =
    taskHits.length + listMatches.length + spaceMatches.length + docMatches.length + memberMatches.length > 0;

  let runningIdx = -1;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-[520px]">
      <label
        className={cn(
          'flex h-8 items-center gap-2 rounded-full border bg-background/95 px-3 shadow-sm transition',
          open
            ? 'border-primary/60 ring-2 ring-primary/30'
            : 'border-border/70 hover:border-border'
        )}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={`Search (${shortcutLabel})`}
          className="h-full flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Global search"
        />
        {query ? (
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              setQuery('');
              setDebounced('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <span className="hidden rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            {shortcutLabel}
          </span>
        )}
      </label>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-hidden rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="max-h-[70vh] overflow-y-auto py-1">
            {loadingTasks && taskHits.length === 0 && !hasAnyResults && (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching…
              </div>
            )}

            {!loadingTasks && debounced && !hasAnyResults && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No matches for <span className="font-medium text-foreground">"{debounced}"</span>
              </div>
            )}

            {taskHits.length > 0 && (
              <ResultGroup icon={<CheckSquare className="h-3.5 w-3.5" />} label="Tasks">
                {taskHits.map((t) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIndex;
                  return (
                    <ResultRow
                      key={`t-${t.id}`}
                      active={active}
                      title={t.title}
                      subtitle={[t.space_name, t.list_name].filter(Boolean).join(' › ') || undefined}
                      onClick={() => handleSelect({ kind: 'task', data: t })}
                    />
                  );
                })}
              </ResultGroup>
            )}

            {listMatches.length > 0 && (
              <ResultGroup icon={<ListChecks className="h-3.5 w-3.5" />} label="Lists">
                {listMatches.map((l) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIndex;
                  const space = spaceById.get(l.space_id);
                  return (
                    <ResultRow
                      key={`l-${l.id}`}
                      active={active}
                      title={l.name}
                      subtitle={space?.name}
                      onClick={() => handleSelect({ kind: 'list', data: l })}
                    />
                  );
                })}
              </ResultGroup>
            )}

            {spaceMatches.length > 0 && (
              <ResultGroup icon={<FolderKanban className="h-3.5 w-3.5" />} label="Spaces">
                {spaceMatches.map((s) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIndex;
                  return (
                    <ResultRow
                      key={`s-${s.id}`}
                      active={active}
                      title={s.name}
                      subtitle={s.department || undefined}
                      onClick={() => handleSelect({ kind: 'space', data: s })}
                    />
                  );
                })}
              </ResultGroup>
            )}

            {docMatches.length > 0 && (
              <ResultGroup icon={<FileText className="h-3.5 w-3.5" />} label="Docs">
                {docMatches.map((d) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIndex;
                  return (
                    <ResultRow
                      key={`d-${d.id}`}
                      active={active}
                      title={d.title}
                      subtitle={d.file_name || d.category}
                      onClick={() => handleSelect({ kind: 'doc', data: d })}
                    />
                  );
                })}
              </ResultGroup>
            )}

            {memberMatches.length > 0 && (
              <ResultGroup icon={<Users className="h-3.5 w-3.5" />} label="People">
                {memberMatches.map((m) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIndex;
                  return (
                    <ResultRow
                      key={`m-${m.id}`}
                      active={active}
                      title={m.label}
                      onClick={() => handleSelect({ kind: 'member', data: m })}
                    />
                  );
                })}
              </ResultGroup>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border/70 bg-background px-1">↑</kbd>{' '}
              <kbd className="rounded border border-border/70 bg-background px-1">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="rounded border border-border/70 bg-background px-1">Enter</kbd> to open
              <span className="ml-2">
                <kbd className="rounded border border-border/70 bg-background px-1">Esc</kbd> to close
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors',
        active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60 text-foreground'
      )}
    >
      <span className="truncate font-medium">{title}</span>
      {subtitle && (
        <span className="ml-2 max-w-[50%] truncate text-[10px] text-muted-foreground">{subtitle}</span>
      )}
    </button>
  );
}
