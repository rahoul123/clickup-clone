import { create } from 'zustand';
import type { Workspace, Space, Folder, List, Task, TaskStatus, TaskPriority } from '@/types';

interface AppState {
  // Current selections
  currentWorkspace: Workspace | null;
  currentSpace: Space | null;
  currentFolder: Folder | null;
  currentList: List | null;

  // Data
  workspaces: Workspace[];
  spaces: Space[];
  folders: Folder[];
  lists: List[];
  tasks: Task[];

  // Actions
  setCurrentWorkspace: (w: Workspace | null) => void;
  setCurrentSpace: (s: Space | null) => void;
  setCurrentFolder: (f: Folder | null) => void;
  setCurrentList: (l: List | null) => void;
  setWorkspaces: (w: Workspace[]) => void;
  setSpaces: (s: Space[]) => void;
  setFolders: (f: Folder[]) => void;
  setLists: (l: List[]) => void;
  setTasks: (t: Task[]) => void;
  addTask: (t: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentWorkspace: null,
  currentSpace: null,
  currentFolder: null,
  currentList: null,
  workspaces: [],
  spaces: [],
  folders: [],
  lists: [],
  tasks: [],

  setCurrentWorkspace: (w) => set({ currentWorkspace: w }),
  setCurrentSpace: (s) => set({ currentSpace: s }),
  setCurrentFolder: (f) => set({ currentFolder: f }),
  setCurrentList: (l) => set({ currentList: l }),
  setWorkspaces: (w) => set({ workspaces: w }),
  setSpaces: (s) => set({ spaces: s }),
  setFolders: (f) => set({ folders: f }),
  setLists: (l) => set({ lists: l }),
  setTasks: (t) => set({ tasks: t }),
  addTask: (t) => set((state) => ({ tasks: [...state.tasks, t] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  deleteTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
}));
