import { useState } from 'react';
import { Plus, Search, Filter, Users, LayoutGrid, List, Star } from 'lucide-react';
import type { Task, TaskStatus, TaskPriority } from '@/types';
import { BoardColumn } from './BoardColumn';
import { AddTaskDialog } from './AddTaskDialog';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'hold', 'revision', 'complete'];

// Demo tasks
const initialTasks: Task[] = [
  {
    id: '1',
    list_id: 'landing-pages',
    title: 'Create 4 Landing Page for Saudi',
    status: 'complete',
    priority: 'urgent',
    assignee_ids: ['u1', 'u2'],
    due_date: '2025-03-14',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    list_id: 'landing-pages',
    title: 'Domains Change for Landing Pages',
    status: 'complete',
    priority: 'high',
    assignee_ids: ['u1', 'u2'],
    due_date: '2025-02-27',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    list_id: 'landing-pages',
    title: 'Change CTA for Landing Page',
    status: 'complete',
    priority: 'high',
    assignee_ids: ['u1', 'u2'],
    due_date: '2025-02-24',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    list_id: 'landing-pages',
    title: 'Create Landing Page for Saudi',
    status: 'complete',
    priority: 'high',
    assignee_ids: ['u1', 'u2'],
    due_date: '2025-02-24',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '5',
    list_id: 'landing-pages',
    title: 'Making Changes in Landing Page Given by Faizan',
    status: 'complete',
    priority: 'urgent',
    assignee_ids: ['u1', 'u2'],
    due_date: '2025-02-19',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

interface KanbanBoardProps {
  listName?: string;
}

export function KanbanBoard({ listName = 'Landing Pages' }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeView, setActiveView] = useState<'board' | 'list'>('board');
  const [addTaskStatus, setAddTaskStatus] = useState<TaskStatus | null>(null);

  const handleAddTask = (status: TaskStatus) => {
    setAddTaskStatus(status);
  };

  const handleCreateTask = (title: string, priority: TaskPriority) => {
    if (!addTaskStatus) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      list_id: 'landing-pages',
      title,
      status: addTaskStatus,
      priority,
      assignee_ids: [],
      created_by: 'u1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, newTask]);
    setAddTaskStatus(null);
  };

  const tasksByStatus = STATUSES.reduce(
    (acc, status) => {
      acc[status] = tasks.filter((t) => t.status === status);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>Team Space</span>
          <span>/</span>
          <span>Website Development</span>
          <span>/</span>
          <span className="text-foreground font-medium">{listName}</span>
          <Star className="w-4 h-4 ml-1 text-muted-foreground hover:text-warning cursor-pointer" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveView('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeView === 'board' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Board
            </button>
            <button
              onClick={() => setActiveView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeView === 'list' ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
              <Users className="w-4 h-4" />
              Group
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors">
              <Search className="w-4 h-4" />
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium">
              <Plus className="w-4 h-4" />
              Task
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onAddTask={handleAddTask}
              onTaskClick={() => {}}
            />
          ))}
        </div>
      </div>

      {/* Add task dialog */}
      {addTaskStatus && (
        <AddTaskDialog
          status={addTaskStatus}
          onClose={() => setAddTaskStatus(null)}
          onCreate={handleCreateTask}
        />
      )}
    </div>
  );
}
