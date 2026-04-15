import { useMemo, type ReactNode } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Target } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import type { DashboardAnalytics } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

interface ModernDashboardProps {
  analytics: DashboardAnalytics | null;
  loading: boolean;
}

const monthChartConfig = {
  total: { label: 'Total', color: 'hsl(224, 76%, 58%)' },
  completed: { label: 'Completed', color: 'hsl(142, 72%, 35%)' },
} satisfies ChartConfig;

const statusChartConfig = {
  value: { label: 'Tasks' },
} satisfies ChartConfig;

const statusColors = ['hsl(224, 76%, 58%)', 'hsl(142, 72%, 35%)', 'hsl(38, 92%, 50%)', 'hsl(263, 70%, 50%)', 'hsl(346, 87%, 43%)'];

export function ModernDashboard({ analytics, loading }: ModernDashboardProps) {
  const statusPie = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'To Do', value: analytics.statusBreakdown.todo ?? 0 },
      { name: 'In Progress', value: analytics.statusBreakdown.in_progress ?? 0 },
      { name: 'Hold', value: analytics.statusBreakdown.hold ?? 0 },
      { name: 'Revision', value: analytics.statusBreakdown.revision ?? 0 },
      { name: 'Complete', value: analytics.statusBreakdown.complete ?? 0 },
    ];
  }, [analytics]);

  const priorityBars = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Urgent', value: analytics.priorityBreakdown.urgent ?? 0, fill: 'hsl(0, 84%, 55%)' },
      { name: 'High', value: analytics.priorityBreakdown.high ?? 0, fill: 'hsl(28, 88%, 54%)' },
      { name: 'Normal', value: analytics.priorityBreakdown.normal ?? 0, fill: 'hsl(212, 89%, 56%)' },
      { name: 'Low', value: analytics.priorityBreakdown.low ?? 0, fill: 'hsl(142, 72%, 35%)' },
    ];
  }, [analytics]);

  const scopeLabel =
    analytics?.scope === 'organization'
      ? 'Admin View: All Team Spaces'
      : analytics?.scope === 'team'
        ? 'Team View: TL / Manager Scope'
        : 'Personal View: Your Tasks Only';

  if (loading) {
    return <main className="flex-1 p-6 text-sm text-muted-foreground">Loading dashboard analytics...</main>;
  }

  if (!analytics) {
    return <main className="flex-1 p-6 text-sm text-muted-foreground">No dashboard data available yet.</main>;
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{scopeLabel}. Month-wise analysis and performance trends.</p>
        </div>
        <div className="text-sm text-muted-foreground">
          Your completion rate: <span className="font-semibold text-foreground">{analytics.currentUserPerformance.completion_rate}%</span>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard title="Total Tasks" value={analytics.summary.total_tasks} hint="All visible tasks" icon={<Activity className="w-4 h-4" />} />
        <MetricCard
          title="Completed"
          value={analytics.summary.completed_tasks}
          hint={`${analytics.summary.completion_rate}% completion`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="In Progress"
          value={analytics.summary.in_progress_tasks}
          hint="Active pipeline"
          icon={<Clock3 className="w-4 h-4 text-blue-600" />}
        />
        <MetricCard
          title="Overdue"
          value={analytics.summary.overdue_open_tasks}
          hint="Need attention"
          icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Due in 7 Days"
          value={analytics.summary.due_soon_tasks}
          hint="Upcoming deadlines"
          icon={<Target className="w-4 h-4 text-violet-600" />}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Task Trend</CardTitle>
            <CardDescription>Compare total tasks vs completed tasks month-wise.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={monthChartConfig} className="h-[300px] w-full aspect-auto">
              <LineChart data={analytics.monthly}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Distribution</CardTitle>
            <CardDescription>Workload split by status.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={statusChartConfig} className="h-[300px] w-full aspect-auto">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {statusPie.map((_, index) => (
                    <Cell key={`status-${index}`} fill={statusColors[index % statusColors.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Priority Breakdown</CardTitle>
            <CardDescription>How many urgent/high/normal/low tasks are in your flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={statusChartConfig} className="h-[280px] w-full aspect-auto">
              <BarChart data={priorityBars}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {priorityBars.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Contributors</CardTitle>
            <CardDescription>Most completed tasks in visible scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.teamPerformance.length === 0 ? (
              <div className="text-sm text-muted-foreground">No contributor data.</div>
            ) : (
              analytics.teamPerformance.map((member) => (
                <div key={member.user_id} className="border rounded-md p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{member.user_name}</p>
                    <span className="text-xs text-muted-foreground">{member.completion_rate}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {member.completed} done out of {member.total}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {analytics.viewerRole === 'admin' && analytics.spaceMonthly.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Space-wise Monthly Analysis</h2>
            <p className="text-sm text-muted-foreground">Every team space displayed separately month-wise for admin.</p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {analytics.spaceMonthly.map((space) => (
              <Card key={`${space.workspace_id ?? 'ws'}-${space.space_id ?? 'sp'}`}>
                <CardHeader>
                  <CardTitle className="text-base truncate">{space.space_name}</CardTitle>
                  <CardDescription className="truncate">{space.workspace_name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={monthChartConfig} className="h-[220px] w-full aspect-auto">
                    <LineChart data={space.monthly}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function MetricCard({ title, value, hint, icon }: { title: string; value: number; hint: string; icon: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between text-xs uppercase tracking-wide">
          {title}
          {icon}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
