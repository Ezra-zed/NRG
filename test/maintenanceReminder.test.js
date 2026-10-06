import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarMonths, processDueMaintenanceReminders } from '../services/maintenanceReminder.job.js';
import { ORDER_STAGES, orderStageProgress } from '../config/projectLifecycle.js';
import { activateOrderTracking, advanceOrderStage } from '../services/projectTracking.service.js';

test('maintenance reminder uses calendar months and clamps short target months', () => {
  assert.equal(addCalendarMonths(new Date('2025-01-31T10:20:30.000Z'), 3).toISOString(), '2025-04-30T10:20:30.000Z');
  assert.equal(addCalendarMonths(new Date('2025-10-06T10:20:30.000Z'), 3).toISOString(), '2026-01-06T10:20:30.000Z');
});

test('order journey exposes all requested milestones and confirmation advances the indicator', () => {
  assert.deepEqual(ORDER_STAGES.map(({ label }) => label), [
    'Order Placed', 'Order Confirmed', 'Installer Assigned', 'Site Survey',
    'Installation Scheduled', 'Installation In Progress', 'Installation Completed',
  ]);
  assert.equal(orderStageProgress('order-placed'), 0);
  assert.ok(orderStageProgress('installer-assigned') > 0);
  assert.equal(orderStageProgress('installation-completed'), 100);
});

test('installer acceptance confirms and assigns once, then completion schedules one reminder', async () => {
  const projectId = '507f1f77bcf86cd799439012';
  const companyId = '507f1f77bcf86cd799439011';
  const ownerId = '507f1f77bcf86cd799439013';
  const project = { _id: projectId, userId: ownerId, companyId, status: 'pending', orderStage: 'order-placed', orderHistory: [] };
  let activation;
  const competingLeadUpdates = [];
  await activateOrderTracking({
    projectId, companyId, actorId: companyId, actorRole: 'install-co',
    projectModel: { findOneAndUpdate: async (filter, update) => { activation = { filter, update }; return project; } },
    leadModel: { updateMany: async (...args) => competingLeadUpdates.push(args) },
  });
  assert.equal(activation.update.$set.orderStage, 'installer-assigned');
  assert.deepEqual(activation.update.$push.orderHistory.$each.map((event) => event.status), ['order-confirmed', 'installer-assigned']);
  assert.equal(competingLeadUpdates.length, 1);

  const reminderCalls = [];
  const updated = { ...project, orderStage: 'installation-completed', userId: ownerId };
  let completionTimestamp;
  await advanceOrderStage({
    projectId, companyId, actorId: companyId, actorRole: 'install-co', status: 'installation-completed',
    projectModel: { findOneAndUpdate: async (filter, update) => { assert.equal(filter.orderStage, 'installation-in-progress'); completionTimestamp = update.$set.installationCompletedAt; return { ...updated, ...update.$set }; } },
    userModel: { findById: () => ({ select: () => ({ lean: async () => ({ email: 'customer@example.com' }) }) }) },
    scheduleReminder: async (record) => reminderCalls.push(record),
  });
  assert.equal(reminderCalls.length, 1);
  assert.equal(reminderCalls[0].email, 'customer@example.com');
  assert.equal(reminderCalls[0].completedAt, completionTimestamp);
});

test('due maintenance reminder sends once and persists the sent status', async () => {
  const completionTimestamp = new Date('2025-01-06T10:20:30.000Z');
  const reminder = {
    _id: 'reminder-1',
    projectId: '507f1f77bcf86cd799439012',
    email: 'customer@example.com',
    attempts: 0,
  };
  const updates = [];
  const sentEmails = [];
  const reminderModel = {
    find: () => ({
      sort() { return this; },
      limit() { return this; },
      select() { return this; },
      lean: async () => [{ _id: reminder._id }],
    }),
    findOneAndUpdate: async (filter, update) => {
      assert.equal(filter._id, reminder._id);
      assert.equal(update.$set.status, 'processing');
      return { ...reminder, attempts: 1 };
    },
    updateOne: async (filter, update) => updates.push({ filter, update }),
  };
  const projectModel = {
    findOne: () => ({
      select: () => ({ lean: async () => ({ installationCompletedAt: completionTimestamp }) }),
    }),
  };

  await processDueMaintenanceReminders({
    reminderModel,
    projectModel,
    sendEmail: async (message) => sentEmails.push(message),
  });

  assert.deepEqual(sentEmails, [{
    to: reminder.email,
    projectId: reminder.projectId,
    completedAt: completionTimestamp,
  }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter.status, 'processing');
  assert.equal(updates[0].update.$set.status, 'sent');
  assert.ok(updates[0].update.$set.sentAt instanceof Date);
  assert.equal(updates[0].update.$set.lockedAt, null);
});
