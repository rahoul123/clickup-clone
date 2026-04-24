import { useEffect, useState } from 'react';
import { AlarmClock, AlertTriangle, Clock, Loader2, Shield, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import type { WorkspaceOverdueSettings } from '@/types';

interface OverdueSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  workspaceName: string;
}

const PRESET_INTERVALS = [15, 30, 60];

/**
 * 24h clock labels used by the office-hours selects. The `end` select gets a
 * 24-labelled "12:00 AM" option (midnight) to represent "until end of day".
 */
function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const END_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1); // 1..24

export function OverdueSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
}: OverdueSettingsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [customActive, setCustomActive] = useState(false);
  const [customValue, setCustomValue] = useState('30');
  const [officeStart, setOfficeStart] = useState(10);
  const [officeEnd, setOfficeEnd] = useState(19);
  // Orphan tasks: tasks whose list/space was deleted but the row survived.
  // The scheduler has to skip them, so we expose a tiny maintenance panel
  // here letting admins see the count and wipe them in one click.
  const [orphanCount, setOrphanCount] = useState<number | null>(null);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [orphanCleaning, setOrphanCleaning] = useState(false);

  // Fetch current settings each time the dialog opens so we never render
  // stale values from a previous workspace.
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setLoading(true);
    api.app
      .getOverdueSettings(workspaceId)
      .then((data: WorkspaceOverdueSettings) => {
        if (cancelled) return;
        setEnabled(Boolean(data.enabled));
        const minutes = Number(data.intervalMinutes) || 30;
        setIntervalMinutes(minutes);
        const isPreset = PRESET_INTERVALS.includes(minutes);
        setCustomActive(!isPreset);
        setCustomValue(String(minutes));
        const startHr = Number.isFinite(Number(data.officeHoursStart))
          ? Math.max(0, Math.min(23, Math.round(Number(data.officeHoursStart))))
          : 10;
        const endHr = Number.isFinite(Number(data.officeHoursEnd))
          ? Math.max(1, Math.min(24, Math.round(Number(data.officeHoursEnd))))
          : 19;
        setOfficeStart(startHr);
        setOfficeEnd(endHr);
      })
      .catch((err) => {
        console.error('Failed to load overdue settings', err);
        toast.error('Failed to load overdue settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  // Separate fetch for orphan tasks. Kept independent of the main settings
  // load so a slow/failing maintenance query doesn't block rendering the
  // actual settings form.
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setOrphanLoading(true);
    setOrphanCount(null);
    api.app
      .listOrphanTasks(workspaceId)
      .then((data: { count: number }) => {
        if (cancelled) return;
        setOrphanCount(Number(data?.count ?? 0));
      })
      .catch((err) => {
        console.error('Failed to load orphan tasks', err);
        if (!cancelled) setOrphanCount(null);
      })
      .finally(() => {
        if (!cancelled) setOrphanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  const handleCleanupOrphans = async () => {
    if (!workspaceId) return;
    setOrphanCleaning(true);
    try {
      const result: { deleted: number } = await api.app.deleteOrphanTasks(workspaceId);
      toast.success(
        result.deleted > 0
          ? `Cleaned up ${result.deleted} orphan task${result.deleted === 1 ? '' : 's'}.`
          : 'No orphan tasks to clean up.',
      );
      setOrphanCount(0);
    } catch (err) {
      console.error('Failed to clean up orphan tasks', err);
      toast.error('Failed to clean up orphan tasks.');
    } finally {
      setOrphanCleaning(false);
    }
  };

  const applyPreset = (minutes: number) => {
    setCustomActive(false);
    setIntervalMinutes(minutes);
    setCustomValue(String(minutes));
  };

  const activateCustom = () => {
    setCustomActive(true);
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    let minutesToSave = intervalMinutes;
    if (customActive) {
      const parsed = Number.parseInt(customValue, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) {
        toast.error('Enter a custom interval between 1 and 1440 minutes.');
        return;
      }
      minutesToSave = parsed;
    }
    if (officeStart === officeEnd % 24) {
      toast.error('Office hours start and end cannot be the same.');
      return;
    }
    setSaving(true);
    try {
      const result: WorkspaceOverdueSettings = await api.app.updateOverdueSettings(workspaceId, {
        enabled,
        intervalMinutes: minutesToSave,
        officeHoursStart: officeStart,
        officeHoursEnd: officeEnd,
      });
      setIntervalMinutes(result.intervalMinutes);
      setOfficeStart(result.officeHoursStart);
      setOfficeEnd(result.officeHoursEnd);
      toast.success('Overdue settings updated.');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save overdue settings', err);
      toast.error('Failed to save overdue settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300">
              <AlarmClock className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Overdue notifications</DialogTitle>
              <DialogDescription>
                Admin-only. Applies to every department in{' '}
                <span className="font-medium text-foreground">{workspaceName}</span>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading current settings…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Enable overdue pings</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  When a task's due date passes and it's still incomplete, re-notify the
                  assignees and the creator at the interval below until it's marked complete.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="Toggle overdue notifications"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notification interval
              </Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_INTERVALS.map((minutes) => {
                  const isActive = !customActive && intervalMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      disabled={!enabled}
                      onClick={() => applyPreset(minutes)}
                      className={
                        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ' +
                        (isActive
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed')
                      }
                    >
                      {minutes} min
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={activateCustom}
                  className={
                    'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (customActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed')
                  }
                >
                  Custom
                </button>
              </div>
              {customActive && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    disabled={!enabled}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="w-28"
                  />
                  <span className="text-xs text-muted-foreground">minutes (1 – 1440)</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3 w-3" />
                Office hours window
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  disabled={!enabled}
                  value={officeStart}
                  onChange={(e) => setOfficeStart(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Office hours start"
                >
                  {START_HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {formatHourLabel(h)}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground">to</span>
                <select
                  disabled={!enabled}
                  value={officeEnd}
                  onChange={(e) => setOfficeEnd(Number(e.target.value))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Office hours end"
                >
                  {END_HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {formatHourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Reminders only fire inside this window (server time). Outside, pings queue
                until the next office hour.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Only workspace admins can change these settings. The server re-checks every
                minute, respects the interval so assignees never get spammed, and stays silent
                outside office hours.
              </p>
            </div>

            {/* Orphan task maintenance: tasks whose parent list/space was
               deleted. The scheduler skips them (no workspace to route the
               ping to), so they'd never notify. Let admins wipe them. */}
            <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Orphan tasks
                  </p>
                  <p className="mt-0.5 text-amber-800/80 dark:text-amber-200/70">
                    Tasks whose list or space was deleted. They stay in the DB but the
                    scheduler can't notify anyone for them. Cleaning them up lets every
                    remaining overdue task fire properly.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-amber-900 dark:text-amber-200">
                  {orphanLoading
                    ? 'Scanning…'
                    : orphanCount === null
                      ? 'Could not load orphan count.'
                      : orphanCount === 0
                        ? 'No orphan tasks detected.'
                        : `${orphanCount} orphan task${orphanCount === 1 ? '' : 's'} found.`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCleanupOrphans}
                  disabled={orphanLoading || orphanCleaning || !orphanCount}
                  className="h-7 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  {orphanCleaning ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Cleaning…
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-1.5 h-3 w-3" />
                      Clean up
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            type="button"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving} type="button">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
