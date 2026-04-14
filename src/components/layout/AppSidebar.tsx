import { useState } from 'react';
import {
  Home,
  Search,
  Bell,
  MessageSquare,
  FileText,
  BarChart3,
  Timer,
  MoreHorizontal,
  Plus,
  ChevronRight,
  ChevronDown,
  Hash,
  FolderClosed,
  List,
  Lock,
  Settings,
  Users,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarItem {
  id: string;
  name: string;
  icon?: React.ReactNode;
  children?: SidebarItem[];
  type: 'space' | 'folder' | 'list' | 'nav';
  isPrivate?: boolean;
  color?: string;
}

const navItems = [
  { id: 'home', name: 'Home', icon: <Home className="w-4 h-4" />, type: 'nav' as const },
  { id: 'notifications', name: 'Notifications', icon: <Bell className="w-4 h-4" />, type: 'nav' as const },
  { id: 'docs', name: 'Docs', icon: <FileText className="w-4 h-4" />, type: 'nav' as const },
  { id: 'dashboards', name: 'Dashboards', icon: <BarChart3 className="w-4 h-4" />, type: 'nav' as const },
  { id: 'timesheets', name: 'Timesheets', icon: <Timer className="w-4 h-4" />, type: 'nav' as const },
];

const demoSpaces: SidebarItem[] = [
  {
    id: 'team-space',
    name: 'Team Space',
    type: 'space',
    color: '#7C3AED',
    children: [
      {
        id: 'website-dev',
        name: 'Website Development',
        type: 'folder',
        isPrivate: true,
        children: [
          { id: 'landing-pages', name: 'Landing Pages', type: 'list' },
          { id: 'dm-websites', name: 'DM Websites', type: 'list' },
          { id: 'wordpress', name: 'Wordpress Tasks', type: 'list' },
        ],
      },
      {
        id: 'billing',
        name: 'Billing Team',
        type: 'folder',
        children: [
          { id: 'invoices', name: 'Invoices', type: 'list' },
        ],
      },
      {
        id: 'content',
        name: 'Content Arbitrage',
        type: 'folder',
        children: [
          { id: 'facebook', name: 'Facebook', type: 'list' },
        ],
      },
    ],
  },
];

interface AppSidebarProps {
  activeList: string | null;
  onSelectList: (listId: string) => void;
  workspaceName?: string;
}

export function AppSidebar({ activeList, onSelectList, workspaceName = 'Adceptive Media' }: AppSidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['team-space', 'website-dev']));

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = (item: SidebarItem, depth = 0) => {
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;
    const isActive = item.id === activeList;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) toggleExpand(item.id);
            if (item.type === 'list') onSelectList(item.id);
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors group',
            'hover:bg-sidebar-accent',
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
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

          {item.type === 'space' && (
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground flex-shrink-0"
              style={{ backgroundColor: item.color || 'hsl(var(--sidebar-primary))' }}
            >
              {item.name[0]}
            </span>
          )}
          {item.type === 'folder' && <FolderClosed className="w-4 h-4 flex-shrink-0 text-sidebar-muted" />}
          {item.type === 'list' && <Hash className="w-4 h-4 flex-shrink-0 text-sidebar-muted" />}

          <span className="truncate flex-1 text-left">{item.name}</span>

          {item.isPrivate && <Lock className="w-3 h-3 text-sidebar-muted opacity-0 group-hover:opacity-100" />}

          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
            <MoreHorizontal className="w-3.5 h-3.5 text-sidebar-muted" />
            <Plus className="w-3.5 h-3.5 text-sidebar-muted" />
          </div>
        </button>

        {hasChildren && isExpanded && (
          <div>{item.children!.map((child) => renderItem(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-60 h-screen flex flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0">
      {/* Workspace header */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm">
            {workspaceName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-accent-foreground truncate">{workspaceName}</p>
            <p className="text-xs text-sidebar-muted">8 members · Unlimited</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="flex-1 text-xs py-1.5 px-3 rounded border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex items-center justify-center gap-1">
            <Settings className="w-3 h-3" /> Settings
          </button>
          <button className="flex-1 text-xs py-1.5 px-3 rounded border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex items-center justify-center gap-1">
            <Users className="w-3 h-3" /> Invite
          </button>
        </div>
      </div>

      {/* Nav items */}
      <div className="px-2 py-2 space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            className="w-full flex items-center gap-3 px-3 py-1.5 text-sm text-sidebar-foreground rounded-md hover:bg-sidebar-accent transition-colors"
          >
            {item.icon}
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      {/* Spaces */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        <div className="flex items-center justify-between px-3 mb-1">
          <span className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider">Spaces</span>
          <button className="text-sidebar-muted hover:text-sidebar-foreground">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {demoSpaces.map((space) => renderItem(space))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
