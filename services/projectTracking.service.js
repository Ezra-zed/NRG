import Project from '../models/Project.model.js';
import Lead from '../models/Lead.model.js';
import User from '../models/User.model.js';
import { ORDER_STAGES, ORDER_STAGE_STATUSES } from '../config/projectLifecycle.js';
import { createMaintenanceReminder } from './maintenanceReminder.job.js';
import AppError from '../utils/AppError.js';

export const activateOrderTracking = async ({ projectId, companyId, actorId, actorRole, projectModel = Project, leadModel = Lead }) => {
  if (actorRole !== 'install-co') throw new AppError('Only an installer may accept a solar project order.', 403, true, 'FORBIDDEN');
  const now = new Date();
  const orderHistory = [
    { status: 'order-confirmed', message: 'The installer accepted the project order.', actorId, actorRole, createdAt: now },
    { status: 'installer-assigned', message: 'An installer has been assigned to this project.', actorId, actorRole, createdAt: now },
  ];
  const project = await projectModel.findOneAndUpdate({
    _id: projectId,
    status: { $ne: 'cancelled' },
    $or: [{ companyId: null }, { companyId }],
    orderStage: 'order-placed',
  }, {
    $set: { companyId, orderStage: 'installer-assigned' },
    $push: { orderHistory: { $each: orderHistory } },
  }, { returnDocument: 'after', runValidators: true });
  if (!project) {
    const existing = await projectModel.findById(projectId).select('companyId status orderStage').lean();
    if (!existing || existing.status === 'cancelled') throw new AppError('This project is unavailable for installer acceptance.', 409, true, 'PROJECT_NOT_ACCEPTABLE');
    if (String(existing.companyId || '') !== String(companyId)) throw new AppError('This project has already been assigned to another installer.', 409, true, 'PROJECT_ALREADY_ASSIGNED');
    // Idempotent acceptance of the same lead must not duplicate audit events.
  }
  await leadModel.updateMany({ projectId, companyId: { $ne: companyId }, status: { $nin: ['won', 'lost', 'rejected'] } }, { $set: { status: 'lost' } });
  return project;
};

export const advanceOrderStage = async ({ projectId, companyId, actorId, actorRole, status, message, projectModel = Project, userModel = User, scheduleReminder = createMaintenanceReminder }) => {
  if (!['install-co', 'admin'].includes(actorRole)) throw new AppError('Only the assigned installer may update order progress.', 403, true, 'FORBIDDEN');
  const index = ORDER_STAGE_STATUSES.indexOf(status);
  if (index <= 0) throw new AppError('Order stage must advance one step at a time.', 409, true, 'INVALID_ORDER_TRANSITION');
  const previousStage = ORDER_STAGE_STATUSES[index - 1];
  const now = new Date();
  const fields = { orderStage: status };
  if (status === 'installation-completed') fields.installationCompletedAt = now;
  const updated = await projectModel.findOneAndUpdate({
    _id: projectId,
    ...(actorRole === 'admin' ? {} : { companyId }),
    status: { $ne: 'cancelled' },
    orderStage: previousStage,
  }, {
    $set: fields,
    $push: { orderHistory: { status, message: message || `${ORDER_STAGES[index].label} updated.`, actorId, actorRole, createdAt: now } },
  }, { returnDocument: 'after', runValidators: true });
  if (!updated) {
    const current = await projectModel.findById(projectId).select('companyId status orderStage').lean();
    if (!current) throw new AppError('Project not found.', 404);
    if (String(current.companyId || '') !== String(companyId) && actorRole !== 'admin') throw new AppError('Only the assigned installer may update this project.', 403, true, 'FORBIDDEN');
    if (current.status === 'cancelled') throw new AppError('Cancelled projects cannot be updated.', 409, true, 'PROJECT_CANCELLED');
    throw new AppError('Order stage must advance exactly one step; reload and try again.', 409, true, 'INVALID_ORDER_TRANSITION');
  }
  if (status === 'installation-completed') {
    const ownerId = updated.userId || updated.customerId;
    const customer = ownerId ? await userModel.findById(ownerId).select('email').lean() : null;
    if (customer?.email) {
      await scheduleReminder({ projectId: updated._id, customerId: ownerId, email: customer.email, completedAt: now });
    }
  }
  return updated;
};

export const orderTrackingView = (project) => ({
  orderStage: project.orderStage || 'order-placed',
  orderStageLabel: ORDER_STAGES.find(({ status }) => status === project.orderStage)?.label || ORDER_STAGES[0].label,
  orderProgressPercent: Math.max(0, Math.min(100, Math.round((Math.max(0, ORDER_STAGE_STATUSES.indexOf(project.orderStage || 'order-placed') - 1) / (ORDER_STAGES.length - 1)) * 100))),
  orderHistory: (project.orderHistory || []).map((event) => ({
    id: event._id?.toString(), status: event.status,
    statusLabel: ORDER_STAGES.find(({ status }) => status === event.status)?.label || event.status,
    message: event.message || null, createdAt: event.createdAt,
  })),
  installationCompletedAt: project.installationCompletedAt || null,
});
