import { formatDistanceToNow, parseISO } from 'date-fns';
import { Bell, CheckCircle2, Inbox, Sparkles } from 'lucide-react';
import type { Notification } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface NotificationsPanelProps {
  notifications: Notification[];
  loading: boolean;
  onMarkRead: (id: string) => void;
  onOpenTask?: (taskId: string) => void;
}

export function NotificationsPanel({ notifications, loading, onMarkRead, onOpenTask }: NotificationsPanelProps) {
  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-background via-background to-primary/[0.04] p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="pb-4">
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Bell className="h-3.5 w-3.5" />
              Notifications
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-tight">Activity Center</CardTitle>
                <CardDescription className="mt-1">Task create/update alerts from your team spaces.</CardDescription>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-right shadow-sm">
                <p className="text-[11px] text-muted-foreground">Unread</p>
                <p className="text-lg font-semibold text-foreground">{unreadCount}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="rounded-xl border border-border/70 bg-background/80 p-8 text-center text-sm text-muted-foreground">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/80 p-10 text-center">
                <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No notifications yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">New team updates will appear here.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm',
                        item.read
                          ? 'border-border/70 bg-background/80 hover:bg-muted/35'
                          : 'border-primary/30 bg-primary/[0.06] shadow-sm hover:bg-primary/[0.09]'
                      )}
                      onClick={() => {
                        if (!item.read) onMarkRead(item.id);
                        if (item.taskId && onOpenTask) onOpenTask(item.taskId);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn('mt-0.5', item.read ? 'text-muted-foreground' : 'text-primary')}>
                          {item.read ? <CheckCircle2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{item.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!item.read && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                            <Sparkles className="h-2.5 w-2.5" />
                            new
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
