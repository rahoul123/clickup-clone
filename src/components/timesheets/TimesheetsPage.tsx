import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock3, ListChecks, Timer, TrendingUp } from 'lucide-react';
import type { Task } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface TimesheetsPageProps {
  tasks: Task[];
}

export function TimesheetsPage({ tasks }: TimesheetsPageProps) {
  const completed = tasks.filter((task) => task.status === 'complete').length;
  const inProgress = tasks.filter((task) => task.status === 'in_progress').length;
  const open = tasks.length - completed;
  const completionRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

  const recentUpdates = [...tasks]
    .sort((a, b) => parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <main className="flex-1 overflow-y-auto bg-gradient-to-br from-background via-background to-primary/[0.04] p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Timer className="h-3.5 w-3.5" />
              Timesheets
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-tight">Worklog Overview</CardTitle>
                <CardDescription className="mt-1">Task activity snapshot for current selected list/workspace.</CardDescription>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-right shadow-sm">
                <p className="text-[11px] text-muted-foreground">Completion</p>
                <p className="text-lg font-semibold text-foreground">{completionRate}%</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-background p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Total tasks</p>
              <p className="mt-1 text-2xl font-semibold">{tasks.length}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">In progress</p>
              <p className="mt-1 text-2xl font-semibold">{inProgress}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Open remaining</p>
              <p className="mt-1 text-2xl font-semibold">{open}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background p-3 shadow-sm">
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="mt-1 text-2xl font-semibold">{completed}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Recent Task Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentUpdates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No task activity found.</p>
            ) : (
              <ul className="space-y-2">
                {recentUpdates.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        <ListChecks className="mr-1 inline h-3.5 w-3.5" />
                        {task.status.replace('_', ' ')}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                      {format(parseISO(task.updated_at), 'dd MMM, h:mm a')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed tasks: {completed}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
