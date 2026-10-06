import MaintenanceReminder from '../models/MaintenanceReminder.model.js';
import Project from '../models/Project.model.js';
import User from '../models/User.model.js';
import { sendMaintenanceReminder } from './email.service.js';

const monthDelay = () => {
  const months = Number(process.env.MAINTENANCE_REMINDER_MONTHS || 3);
  return Number.isInteger(months) && months > 0 && months <= 24 ? months : 3;
};

export const addCalendarMonths = (date, months = monthDelay()) => {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
};

export const createMaintenanceReminder = async ({ projectId, customerId, email, completedAt }) => {
  if (!email) return null;
  const scheduledAt = addCalendarMonths(completedAt);
  return MaintenanceReminder.findOneAndUpdate(
    { projectId },
    { $setOnInsert: { projectId, customerId, email, scheduledAt, status: 'scheduled' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
};

export const reconcileCompletedProjects = async ({ projectModel = Project, reminderModel = MaintenanceReminder, userModel = User } = {}) => {
  const remindedProjectIds = await reminderModel.distinct('projectId');
  const projects = await projectModel.find({ _id: { $nin: remindedProjectIds }, orderStage: 'installation-completed', installationCompletedAt: { $ne: null }, status: { $ne: 'cancelled' } })
    .select('_id userId customerId installationCompletedAt').sort({ installationCompletedAt: 1 }).limit(100).lean();
  for (const project of projects) {
    const customerId = project.userId || project.customerId;
    if (!customerId) continue;
    const customer = await userModel.findById(customerId).select('email').lean();
    if (customer?.email) await createMaintenanceReminder({ projectId: project._id, customerId, email: customer.email, completedAt: project.installationCompletedAt });
  }
};

export const processDueMaintenanceReminders = async ({ reminderModel = MaintenanceReminder, projectModel = Project, sendEmail = sendMaintenanceReminder } = {}) => {
  const now = new Date();
  const due = await reminderModel.find({ scheduledAt: { $lte: now }, $or: [
    { status: 'scheduled', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
    { status: 'processing', lockedAt: { $lt: new Date(now.getTime() - 15 * 60 * 1000) } },
  ] }).sort({ scheduledAt: 1 }).limit(25).select('_id').lean();
  for (const { _id } of due) {
    const claimed = await reminderModel.findOneAndUpdate({ _id, $or: [
      { status: 'scheduled', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
      { status: 'processing', lockedAt: { $lt: new Date(now.getTime() - 15 * 60 * 1000) } },
    ] }, { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (!claimed) continue;
    const project = await projectModel.findOne({ _id: claimed.projectId, status: { $ne: 'cancelled' }, orderStage: 'installation-completed', installationCompletedAt: { $ne: null } }).select('installationCompletedAt').lean();
    if (!project) {
      await reminderModel.updateOne({ _id, status: 'processing' }, { $set: { status: 'cancelled', lockedAt: null } });
      continue;
    }
    try {
      await sendEmail({ to: claimed.email, projectId: claimed.projectId.toString(), completedAt: project.installationCompletedAt });
      await reminderModel.updateOne({ _id, status: 'processing' }, { $set: { status: 'sent', sentAt: new Date(), lockedAt: null }, $unset: { lastError: 1, nextAttemptAt: 1 } });
    } catch (error) {
      const retryDelayMs = Math.min(24 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(10, Math.max(0, Number(claimed.attempts || 1) - 1))));
      await reminderModel.updateOne({ _id, status: 'processing' }, { $set: { status: 'scheduled', lockedAt: null, nextAttemptAt: new Date(now.getTime() + retryDelayMs), lastError: String(error.message || error).slice(0, 1000) } });
      console.error('[maintenance-reminder] Email delivery failed; reminder will retry.', error.message);
    }
  }
};

export const startMaintenanceReminderJob = () => {
  const run = async () => {
    try {
      await reconcileCompletedProjects();
      await processDueMaintenanceReminders();
    } catch (error) {
      console.error('[maintenance-reminder] Job failed.', error);
    }
  };
  void run();
  const timer = setInterval(run, Number(process.env.MAINTENANCE_REMINDER_POLL_MS) || 60_000);
  timer.unref?.();
  return timer;
};
