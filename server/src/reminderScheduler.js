import { randomUUID } from 'crypto';
import { Notification, Reminder } from './models.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000; // poll every 60s

function formatDue(date) {
  try {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(date).toISOString();
  }
}

async function createNotificationsForReminder(reminder, kind, realtime) {
  const now = new Date();
  const dueText = formatDue(reminder.dueDate);
  const prefix = kind === 'reminder_pre_day' ? 'Upcoming reminder' : 'Reminder due';
  const message = `${prefix}: "${reminder.title}" — ${dueText}`;

  const targets = Array.isArray(reminder.notifyUserIds) && reminder.notifyUserIds.length > 0
    ? reminder.notifyUserIds
    : [reminder.createdBy];

  const uniqueTargets = Array.from(new Set(targets.filter(Boolean)));
  if (uniqueTargets.length === 0) return;

  const docs = uniqueTargets.map((userId) => ({
    _id: randomUUID(),
    userId,
    workspaceId: reminder.workspaceId,
    taskId: null,
    reminderId: reminder._id,
    type: kind,
    message,
    read: false,
    createdAt: now,
    updatedAt: now,
  }));

  await Notification.insertMany(docs, { ordered: false }).catch((err) => {
    console.error('[reminder] Failed to insert notifications', err);
  });

  // Push each recipient their own fresh notification so the UI bell/toasts
  // can update instantly without waiting for the next poll. Shape matches
  // the `Notification` DTO from GET /notifications.
  if (realtime?.toUser) {
    for (const doc of docs) {
      realtime.toUser(doc.userId, 'notification:new', {
        id: doc._id,
        taskId: null,
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
 * Single processing pass: find all pending reminders whose due date is within the next 24h
 * or already past, and dispatch any notifications that are still owed.
 */
export async function processReminders(realtime) {
  const now = new Date();

  // Only consider things that could plausibly need a notification soon or are overdue.
  const windowEnd = new Date(now.getTime() + ONE_DAY_MS + 60 * 60 * 1000); // +1h slack

  const candidates = await Reminder.find({
    status: 'pending',
    dueDate: { $lte: windowEnd },
  }).lean();

  for (const reminder of candidates) {
    const due = new Date(reminder.dueDate).getTime();
    const diffMs = due - now.getTime();

    // Pre-day: within (0, 24h] before due date.
    const needsPreDay =
      !reminder.preDayNotifiedAt &&
      diffMs > 0 &&
      diffMs <= ONE_DAY_MS;

    // Due-day: due moment has arrived/passed.
    const needsDue =
      !reminder.dueDayNotifiedAt && diffMs <= 0;

    if (!needsPreDay && !needsDue) continue;

    if (needsPreDay) {
      await createNotificationsForReminder(reminder, 'reminder_pre_day', realtime);
    }
    if (needsDue) {
      await createNotificationsForReminder(reminder, 'reminder_due', realtime);
    }

    const update = {};
    if (needsPreDay) update.preDayNotifiedAt = now;
    if (needsDue) update.dueDayNotifiedAt = now;
    await Reminder.updateOne({ _id: reminder._id }, { $set: update }).catch((err) => {
      console.error('[reminder] Failed to mark notified flags', err);
    });
  }
}

/**
 * Start a background poller. Safe to call once after DB connect.
 * Returns a handle with .stop() for graceful shutdown.
 */
export function startReminderScheduler({ intervalMs = DEFAULT_INTERVAL_MS, realtime } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return; // prevent overlap
    running = true;
    try {
      await processReminders(realtime);
    } catch (err) {
      console.error('[reminder] scheduler tick failed', err);
    } finally {
      running = false;
    }
  };

  // Fire once shortly after startup so new reminders get picked up quickly.
  const initial = setTimeout(tick, 3000);
  const handle = setInterval(tick, intervalMs);
  console.log(`[reminder] scheduler running every ${Math.round(intervalMs / 1000)}s`);

  return {
    stop() {
      clearTimeout(initial);
      clearInterval(handle);
    },
  };
}
