import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/sonner';
import {
  endOfMonth,
  format,
  startOfMonth,
  subDays,
  subMonths,
  isAfter,
  isBefore,
  parseISO,
} from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '@/types';
import { STATUS_CONFIG } from '@/types';

export type ExportReportOptions = {
  scope: 'all' | 'space';
  spaceId?: string;
  rangePreset: 'this_month' | 'last_month' | 'last_30' | 'custom';
  dateFrom: Date;
  dateTo: Date;
  detail: 'summary' | 'full';
};

function getDateRange(preset: ExportReportOptions['rangePreset'], fromStr: string, toStr: string): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'this_month') {
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }
  if (preset === 'last_month') {
    const last = subMonths(now, 1);
    return { from: startOfMonth(last), to: endOfMonth(last) };
  }
  if (preset === 'last_30') {
    return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
  const from = fromStr ? parseISO(fromStr) : startOfMonth(now);
  const to = toStr ? parseISO(toStr) : endOfMonth(now);
  return { from: startOfDay(from), to: endOfDay(to) };
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function taskInRange(task: Task, from: Date, to: Date) {
  const t = parseISO(task.updated_at);
  return !isBefore(t, from) && !isAfter(t, to);
}

function csvEscape(s: string) {
  const x = String(s ?? '');
  if (/[",\n\r]/.test(x)) return `"${x.replace(/"/g, '""')}"`;
  return x;
}

function downloadCsv(filename: string, rows: string[][]) {
  const lines = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type DepartmentOption = { id: string; name: string };

type ListMeta = { id: string; name: string; space_id: string };

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  departmentSpaces: DepartmentOption[];
  lists: ListMeta[];
  spaceNameById: Record<string, string>;
  listNameById: Record<string, string>;
  fetchTasksForListIds: (listIds: string[]) => Promise<Task[]>;
  /** Admin: full workspace. Manager/TL: department-filtered lists only. */
  viewerIsAdmin: boolean;
  /** Label for “all” scope (admin vs department-scoped wording). */
  scopeAllLabel: string;
  /** Only one department space visible — hide scope picker. */
  singleDepartmentOnly?: boolean;
}

export function ExportReportDialog({
  open,
  onOpenChange,
  workspaceName,
  departmentSpaces,
  lists,
  spaceNameById,
  listNameById,
  fetchTasksForListIds,
  viewerIsAdmin,
  scopeAllLabel,
  singleDepartmentOnly = false,
}: ExportReportDialogProps) {
  const [scope, setScope] = useState<'all' | 'space'>('all');
  const [spaceId, setSpaceId] = useState<string>('');
  const [rangePreset, setRangePreset] = useState<ExportReportOptions['rangePreset']>('this_month');
  const [customFrom, setCustomFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [detail, setDetail] = useState<'summary' | 'full'>('full');
  const [exporting, setExporting] = useState(false);

  const firstDeptId = departmentSpaces[0]?.id ?? '';

  useEffect(() => {
    if (open && firstDeptId) setSpaceId(firstDeptId);
  }, [open, firstDeptId]);

  const listIdsForScope = useMemo(() => {
    if (singleDepartmentOnly) {
      return lists.map((l) => l.id);
    }
    if (scope === 'space') {
      const sid = spaceId || firstDeptId;
      if (!sid) return lists.map((l) => l.id);
      return lists.filter((l) => l.space_id === sid).map((l) => l.id);
    }
    if (departmentSpaces.length > 0) {
      const set = new Set(departmentSpaces.map((d) => d.id));
      return lists.filter((l) => set.has(l.space_id)).map((l) => l.id);
    }
    return lists.map((l) => l.id);
  }, [lists, departmentSpaces, scope, spaceId, firstDeptId, singleDepartmentOnly]);

  const runExport = async () => {
    const { from, to } = getDateRange(
      rangePreset,
      customFrom,
      customTo
    );
    if (isAfter(from, to)) {
      window.alert('Start date must be before end date.');
      return;
    }
    if (departmentSpaces.length === 0) {
      window.alert('No team spaces available for your role in this workspace.');
      return;
    }
    if (listIdsForScope.length === 0) {
      window.alert('No lists in this scope.');
      return;
    }

    setExporting(true);
    try {
      const allTasks = await fetchTasksForListIds(listIdsForScope);
      const filtered = allTasks.filter((t) => taskInRange(t, from, to));

      const stamp = format(new Date(), 'yyyy-MM-dd_HHmm');
      const safeWs = workspaceName.replace(/[^\w\s-]/g, '').slice(0, 40) || 'report';

      if (detail === 'summary') {
        const bySpace = new Map<string, Task[]>();
        for (const task of filtered) {
          const sid = lists.find((x) => x.id === task.list_id)?.space_id ?? '';
          if (!bySpace.has(sid)) bySpace.set(sid, []);
          bySpace.get(sid)!.push(task);
        }
        const statuses: TaskStatus[] = ['todo', 'in_progress', 'hold', 'revision', 'complete'];
        const header = ['Space', 'Total', ...statuses.map((s) => STATUS_CONFIG[s].label)];
        const rows: string[][] = [header];
        for (const [sid, tasks] of bySpace) {
          const name = spaceNameById[sid] ?? sid;
          const counts = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<TaskStatus, number>;
          for (const t of tasks) counts[t.status] += 1;
          rows.push([
            name,
            String(tasks.length),
            ...statuses.map((s) => String(counts[s])),
          ]);
        }
        if (rows.length === 1) {
          rows.push(['—', '0', '0', '0', '0', '0', '0']);
        }
        downloadCsv(`${safeWs}_summary_${stamp}.csv`, rows);
      } else {
        const header = [
          'Title',
          'Status',
          'Priority',
          'Space',
          'List',
          'Assignee IDs',
          'Start',
          'Due',
          'Updated',
        ];
        const rows: string[][] = [header];
        for (const task of filtered) {
          const listMeta = lists.find((x) => x.id === task.list_id);
          const sid = listMeta?.space_id ?? '';
          rows.push([
            task.title,
            STATUS_CONFIG[task.status].label,
            task.priority,
            spaceNameById[sid] ?? '',
            listMeta ? listNameById[listMeta.id] ?? listMeta.name : task.list_id,
            task.assignee_ids.join(';'),
            task.start_date ? format(parseISO(task.start_date), 'yyyy-MM-dd') : '',
            task.due_date ? format(parseISO(task.due_date), 'yyyy-MM-dd') : '',
            format(parseISO(task.updated_at), 'yyyy-MM-dd HH:mm'),
          ]);
        }
        downloadCsv(`${safeWs}_tasks_${stamp}.csv`, rows);
      }

      toast.success('Report downloaded.');
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      window.alert('Export failed. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export report</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose scope and period. File downloads as CSV (opens in Excel).
          </p>
          {!viewerIsAdmin && (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">
              Manager / Team Lead: export is limited to team spaces in your department.
            </p>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Scope</Label>
            {departmentSpaces.length === 0 ? (
              <p className="text-sm text-destructive">No team spaces available for export in this workspace.</p>
            ) : singleDepartmentOnly ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Team space: </span>
                <span className="font-medium">{departmentSpaces[0]?.name}</span>
              </div>
            ) : (
              <>
                <Select
                  value={scope === 'all' ? 'all' : 'space'}
                  onValueChange={(v) => setScope(v as 'all' | 'space')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{scopeAllLabel}</SelectItem>
                    <SelectItem value="space" disabled={!departmentSpaces.length}>
                      Single team space
                    </SelectItem>
                  </SelectContent>
                </Select>
                {scope === 'space' && departmentSpaces.length > 0 && (
                  <Select value={spaceId || firstDeptId} onValueChange={setSpaceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Team space" />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentSpaces.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Period</Label>
            <Select
              value={rangePreset}
              onValueChange={(v) => setRangePreset(v as ExportReportOptions['rangePreset'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="last_30">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {rangePreset === 'custom' && (
              <div className="flex gap-2">
                <div className="flex-1 grid gap-1">
                  <Label className="text-xs">From</Label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
                <div className="flex-1 grid gap-1">
                  <Label className="text-xs">To</Label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Report type</Label>
            <RadioGroup
              value={detail}
              onValueChange={(v) => setDetail(v as 'summary' | 'full')}
              className="grid gap-2"
            >
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors',
                  detail === 'full' && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem value="full" id="exp-full" className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium">All tasks (detail)</span>
                  <p className="text-xs text-muted-foreground">One row per task with columns for status, list, dates.</p>
                </div>
              </label>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors',
                  detail === 'summary' && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem value="summary" id="exp-sum" className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium">Summary by department</span>
                  <p className="text-xs text-muted-foreground">Counts per status for each department space.</p>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void runExport()}
            disabled={exporting || departmentSpaces.length === 0}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
