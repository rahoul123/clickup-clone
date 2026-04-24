import { randomUUID } from 'crypto';
import { Notification, Task, TaskAssignee, Workspace, List, Space } from './models.js';

const DEFAULT_POLL_MS = 60 * 1000;

/**
 * Ordinal-day suffix for notification copy (e.g. 1st, 2nd, 22nd, 26th).
 * Falls back to the plain number when the input isn't a valid date.
 */
function formatDayOrdinal(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  const j = day % 10;
  const k = day % 100;
  if (k >= 11 && k <= 13) return `${day}th`;
  if (j === 1) return `${day}st`;
  if (j === 2) return `${day}nd`;
  if (j === 3) return `${day}rd`;
  return `${day}th`;
}

/**
 * Midnight boundary (server local time) for an arbitrary date. Used to test
 * whether a due datetime falls "tomorrow" / "today" on the calendar rather
 * than strictly counting hours.
 */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d, days) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * True when the given moment falls inside the workspace's configured office
 * hours window (server local time, 24h clock). Wrap-around windows (e.g.
 * 22→06 for night shifts) are handled automatically. Returns true when the
 * window is misconfigured (e.g. start === end) so reminders aren't silently
 * lost.
 */
function isWithinOfficeHours(now, workspace) {
  const startRaw = Number(workspace.officeHoursStart);
  const endRaw = Number(workspace.officeHoursEnd);
  const start = Number.isFinite(startRaw) ? Math.max(0, Math.min(23, startRaw)) : 10;
  const end = Number.isFinite(endRaw) ? Math.max(1, Math.min(24, endRaw)) : 19;
  if (start === end) return true; // misconfigured → fail-open
  const hour = now.getHours();
  if (start < end) return hour >= start && hour < end;
  // Wrap-around (e.g. 22–06): either after start or before end.
  return hour >= start || hour < end;
}

/**
 * Build the workspaceId for a task by walking task -> list -> space. Returns
 * `{ workspaceId, reason }` — `reason` identifies which link snapped so
 * operators can clean up orphan tasks instead of silently losing reminders.
 */
async function resolveWorkspaceIdForTask(task, cache) {
  if (!task.listId) return { workspaceId: null, reason: 'task-has-no-list-id' };
  const list = cache.listById.get(task.listId) || (await List.findById(task.listId).lean());
  if (!list) return { workspaceId: null, reason: 'list-missing' };
  cache.listById.set(task.listId, list);
  if (!list.spaceId) return { workspaceId: null, reason: 'list-has-no-space-id' };
  const space =
    cache.spaceById.get(list.spaceId) || (await Space.findById(list.spaceId).lean());
  if (!space) return { workspaceId: null, reason: 'space-missing' };
  cache.spaceById.set(list.spaceId, space);
  if (!space.workspaceId) return { workspaceId: null, reason: 'space-has-no-workspace-id' };
  return { workspaceId: space.workspaceId, reason: 'ok' };
}

async function collectRecipients(task) {
  const assigneeRows = await TaskAssignee.find({ taskId: task._id }).lean();
  const assigneeIds = assigneeRows.map((r) => r.userId);
  const recipients = new Set(assigneeIds);
  if (task.createdBy) recipients.add(task.createdBy);
  return Array.from(recipients).filter(Boolean);
}

/**
 * Persist + realtime-push a batch of identical notifications (one per
 * recipient). Centralised so the three reminder windows share the same write
 * path.
 */
async function dispatchNotifications({ recipients, workspaceId, task, type, message, realtime }) {
  if (recipients.length === 0) return;
  const now = new Date();
  const docs = recipients.map((userId) => ({
    _id: randomUUID(),
    userId,
    workspaceId,
    taskId: task._id,
    reminderId: null,
    type,
    message,
    read: false,
    createdAt: now,
    updatedAt: now,
  }));

  await Notification.insertMany(docs, { ordered: false }).catch((err) => {
    console.error('[overdue] Failed to insert notifications', err);
  });

  if (realtime?.toUser) {
    for (const doc of docs) {
      realtime.toUser(doc.userId, 'notification:new', {
        id: doc._id,
        taskId: doc.taskId,
        workspaceId: doc.workspaceId,
        type: doc.type,
        message: doc.message,
        read: false,
        createdAt: doc.createdAt.toISOString(),
      });
    }
  }
}

/**
 * Last-second guard: refuse to dispatch anything for a task whose status
 * has flipped to 'complete' between the `find()` and the notify call. This
 * defends against the (rare but possible) race where the user marks a task
 * complete while the scheduler is mid-tick.
 */
async function isTaskStillActive(taskId) {
  const fresh = await Task.findById(taskId).select({ status: 1 }).lean();
  return fresh && fresh.status !== 'complete';
}

/**
 * Send the one-time "your task is due tomorrow" heads-up.
 */
async function notifyDueSoon(task, workspaceId, realtime) {
  if (!(await isTaskStillActive(task._id))) {
    console.log(`[overdue]   aborted due-soon for "${task.title}" — now complete`);
    return;
  }
  const recipients = await collectRecipients(task);
  const dayOrdinal = formatDayOrdinal(task.dueDate);
  const message = `Reminder: Your task "${task.title}" is due tomorrow (${dayOrdinal}). Please make sure to complete it on time.`;
  await dispatchNotifications({
    recipients,
    workspaceId,
    task,
    type: 'task_due_soon',
    message,
    realtime,
  });

  await Task.updateOne({ _id: task._id }, { $set: { dueSoonNotifiedAt: new Date() } }).catch(
    (err) => console.error('[overdue] Failed to stamp dueSoonNotifiedAt', err),
  );
}

/**
 * Recurring "due today" / "overdue" reminder — both share the same channel
 * + interval, only the wording changes based on whether the exact due time
 * has passed yet.
 */
async function notifyDueOrOverdue(task, workspaceId, realtime, now) {
  if (!(await isTaskStillActive(task._id))) {
    console.log(`[overdue]   aborted due/overdue for "${task.title}" — now complete`);
    return;
  }
  const recipients = await collectRecipients(task);
  const dueDate = new Date(task.dueDate);
  // "Due today" vs "Overdue" is decided by calendar day, not strict time:
  // the moment the due day rolls over (next midnight) we switch to the
  // overdue copy even if the raw due time is still "today".
  const startOfDueDay = startOfDay(dueDate);
  const startOfToday = startOfDay(now);
  const isPastDueDay = startOfToday.getTime() > startOfDueDay.getTime();
  const message = isPastDueDay
    ? `❌ Overdue: The task "${task.title}" has passed its due date. Please complete it immediately.`
    : `Reminder: The task "${task.title}" is due today. Please complete it within office hours.`;

  await dispatchNotifications({
    recipients,
    workspaceId,
    task,
    type: 'task_overdue',
    message,
    realtime,
  });

  await Task.updateOne({ _id: task._id }, { $set: { lastOverdueNotifiedAt: now } }).catch(
    (err) => console.error('[overdue] Failed to stamp lastOverdueNotifiedAt', err),
  );
}

/**
 * Single processing pass. For every workspace with overdue notifications
 * enabled, walks three windows:
 *   1. "Due tomorrow" (one-time): task.dueDate's calendar day === tomorrow.
 *   2. "Due today" (recurring at admin interval): dueDate's calendar day is
 *      today and the due time hasn't strictly passed yet.
 *   3. "Overdue" (recurring at admin interval): due time has passed.
 * Both recurring windows share `lastOverdueNotifiedAt` for throttling so the
 * same task never doubles up within one interval.
 */
export async function processOverdueTasks(realtime) {
  const workspaces = await Workspace.find({ overdueNotificationsEnabled: true }).lean();
  if (workspaces.length === 0) return;

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const tomorrowEnd = endOfDay(tomorrowStart);

  const cache = { listById: new Map(), spaceById: new Map() };

  for (const workspace of workspaces) {
    // Honour per-workspace office hours — skip the whole workspace when
    // outside the window so reminders don't land at 2 AM. On the next tick
    // that falls inside office hours we'll catch up everything that queued
    // overnight.
    if (!isWithinOfficeHours(now, workspace)) {
      console.log(
        `[overdue] ${workspace._id} skipped — outside office hours (${workspace.officeHoursStart}–${workspace.officeHoursEnd}, now hour=${now.getHours()})`,
      );
      continue;
    }

    const intervalMinutes = Math.max(1, Number(workspace.overdueNotificationIntervalMinutes || 30));
    const intervalMs = intervalMinutes * 60 * 1000;
    const notifyThreshold = new Date(now.getTime() - intervalMs);
    console.log(
      `[overdue] tick workspace=${workspace._id} interval=${intervalMinutes}m office=${workspace.officeHoursStart}-${workspace.officeHoursEnd}`,
    );

    // --- 1. "Due tomorrow" one-time heads-up -------------------------------
    const dueSoon = await Task.find({
      dueDate: { $gte: tomorrowStart, $lte: tomorrowEnd },
      status: { $ne: 'complete' },
      dueSoonNotifiedAt: null,
    }).lean();

    for (const task of dueSoon) {
      const { workspaceId: taskWorkspaceId, reason } = await resolveWorkspaceIdForTask(
        task,
        cache,
      );
      if (!taskWorkspaceId || taskWorkspaceId !== workspace._id) {
        if (reason !== 'ok') {
          console.log(
            `[overdue]   skipped due-soon task="${task.title}" id=${task._id} listId=${task.listId} reason=${reason}`,
          );
        }
        continue;
      }
      await notifyDueSoon(task, taskWorkspaceId, realtime).catch((err) => {
        console.error('[overdue] Failed due-soon notify', task._id, err);
      });
    }

    // --- 2 + 3. "Due today" + "Overdue" recurring --------------------------
    // Everything whose calendar due day is today or earlier and is still
    // incomplete, throttled by `lastOverdueNotifiedAt`.
    const dueOrOverdue = await Task.find({
      dueDate: { $ne: null, $lte: todayEnd },
      status: { $ne: 'complete' },
      $or: [
        { lastOverdueNotifiedAt: null },
        { lastOverdueNotifiedAt: { $lte: notifyThreshold } },
      ],
    }).lean();
    console.log(
      `[overdue] workspace=${workspace._id} candidates=${dueOrOverdue.length} (incl. all workspaces)`,
    );

    // Additionally log any task whose due date is in the past but was
    // filtered out of this tick (e.g. because `lastOverdueNotifiedAt` is
    // still inside the throttle window). Helps diagnose "why isn't task X
    // getting pinged?" questions.
    const stillHot = await Task.find({
      dueDate: { $ne: null, $lte: todayEnd },
      status: { $ne: 'complete' },
      lastOverdueNotifiedAt: { $gt: notifyThreshold },
    })
      .select({ _id: 1, title: 1, lastOverdueNotifiedAt: 1 })
      .lean();
    for (const t of stillHot) {
      console.log(
        `[overdue]   throttled task="${t.title}" id=${t._id} lastNotified=${new Date(t.lastOverdueNotifiedAt).toISOString()}`,
      );
    }

    for (const task of dueOrOverdue) {
      const { workspaceId: taskWorkspaceId, reason } = await resolveWorkspaceIdForTask(
        task,
        cache,
      );
      if (!taskWorkspaceId) {
        console.log(
          `[overdue]   skipped task="${task.title}" id=${task._id} listId=${task.listId} status=${task.status} reason=${reason} (orphan — list/space deleted)`,
        );
        continue;
      }
      if (taskWorkspaceId !== workspace._id) {
        console.log(
          `[overdue]   skipped task="${task.title}" id=${task._id} status=${task.status} reason=different-workspace (taskWs=${taskWorkspaceId}, thisWs=${workspace._id})`,
        );
        continue;
      }
      const recipients = await collectRecipients(task);
      console.log(
        `[overdue]   notifying task="${task.title}" id=${task._id} status=${task.status} recipients=${recipients.length} (${recipients.join(',')})`,
      );
      await notifyDueOrOverdue(task, taskWorkspaceId, realtime, now).catch((err) => {
        console.error('[overdue] Failed due/overdue notify', task._id, err);
      });
    }
  }
}

/**
 * Start a background poller. Safe to call once after DB connect.
 * Returns a handle with .stop() for graceful shutdown.
 */
export function startOverdueScheduler({ intervalMs = DEFAULT_POLL_MS, realtime } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processOverdueTasks(realtime);
    } catch (err) {
      console.error('[overdue] scheduler tick failed', err);
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(tick, 5000);
  const handle = setInterval(tick, intervalMs);
  console.log(`[overdue] scheduler running every ${Math.round(intervalMs / 1000)}s`);

  return {
    stop() {
      clearTimeout(initial);
      clearInterval(handle);
    },
  };
}
