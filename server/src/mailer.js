import nodemailer from 'nodemailer';

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
  return cachedTransporter;
}

export async function sendInviteEmail({ to, workspaceName, role, department }) {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: 'SMTP not configured' };
  }

  const appBaseUrl = process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || 'http://localhost:8080';
  const inviteUrl = `${appBaseUrl}/signup?email=${encodeURIComponent(to)}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const subject = `Invitation to join ${workspaceName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">You're invited to Collab Creek</h2>
      <p style="margin: 0 0 8px;">You have been invited to join workspace <strong>${workspaceName}</strong>.</p>
      <p style="margin: 0 0 8px;">Assigned role: <strong>${role}</strong></p>
      <p style="margin: 0 0 16px;">Department: <strong>${department}</strong></p>
      <a
        href="${inviteUrl}"
        style="display:inline-block;background:#7c4dff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;"
      >
        Create account and join
      </a>
      <p style="margin-top:16px;font-size:12px;color:#6b7280;">
        If you already have an account with this email, sign in and your invite will apply automatically.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });

  return { sent: true };
}

function buttonHtml(label, url) {
  return `
    <a
      href="${url}"
      style="display:inline-block;background:#7c4dff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;"
    >
      ${label}
    </a>
  `;
}

function taskLink(taskId) {
  const appBaseUrl = process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || 'http://localhost:8080';
  return `${appBaseUrl}/?task=${encodeURIComponent(taskId)}`;
}

/**
 * Sent when a user is assigned to a newly-created task. Never sent on
 * progress/description updates — only on the initial assignment.
 */
export async function sendTaskAssignedEmail({
  to,
  taskTitle,
  taskId,
  priority,
  dueDate,
  assignedByName,
  workspaceName,
}) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: 'SMTP not configured' };
  if (!to) return { sent: false, reason: 'no recipient' };

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `New task assigned: ${taskTitle}`;
  const url = taskLink(taskId);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">You have a new task</h2>
      <p style="margin: 0 0 8px;"><strong>${assignedByName || 'A teammate'}</strong> assigned you a task in <strong>${workspaceName || 'your workspace'}</strong>.</p>
      <p style="margin: 0 0 4px;">Task: <strong>${taskTitle}</strong></p>
      ${priority ? `<p style="margin: 0 0 4px;">Priority: <strong>${priority}</strong></p>` : ''}
      ${dueDate ? `<p style="margin: 0 0 16px;">Due: <strong>${dueDate}</strong></p>` : '<div style="height:12px"></div>'}
      ${buttonHtml('Open task', url)}
      <p style="margin-top:16px;font-size:12px;color:#6b7280;">You're receiving this because you were assigned to this task.</p>
    </div>
  `;

  await transporter.sendMail({ from, to, subject, html });
  return { sent: true };
}

/**
 * Sent when a task's status transitions to "complete". Fires for assignees
 * (and optionally the creator) so everyone involved is notified.
 */
export async function sendTaskCompletedEmail({
  to,
  taskTitle,
  taskId,
  completedByName,
  workspaceName,
}) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: 'SMTP not configured' };
  if (!to) return { sent: false, reason: 'no recipient' };

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `Task completed: ${taskTitle}`;
  const url = taskLink(taskId);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">Task completed</h2>
      <p style="margin: 0 0 8px;"><strong>${completedByName || 'Someone'}</strong> marked a task as complete in <strong>${workspaceName || 'your workspace'}</strong>.</p>
      <p style="margin: 0 0 16px;">Task: <strong>${taskTitle}</strong></p>
      ${buttonHtml('View task', url)}
    </div>
  `;

  await transporter.sendMail({ from, to, subject, html });
  return { sent: true };
}
