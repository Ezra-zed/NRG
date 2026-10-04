import mongoose from 'mongoose';
import Project from '../models/Project.model.js';
import Lead from '../models/Lead.model.js';
import User from '../models/User.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { uploadCurrentBill } from '../services/currentBill.service.js';
import { calculateSolarEstimate } from '../services/solarEstimator.service.js';
import { PROJECT_LIFECYCLE, PROJECT_LIFECYCLE_STATUSES, lifecycleProgress } from '../config/projectLifecycle.js';

export const assertObjectId = (id, label = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new AppError(`Invalid ${label} '${id}': expected a valid ObjectId.`, 400);
  }
};

/**
 * POST /api/projects/request — submit a "Get Solar Quote" request.
 *
 * Creates the Project and auto-distributes it as a Lead to every registered
 * installer/seller company (role install-co / seller-co) so their dashboards
 * can surface it as an available lead.
 *
 * @param {import('express').Request} req
 *   req.body — { location*, monthlyBill?, propertyType?, systemPreference?, budget?, customerId? }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: { project, distributedTo }, message, error }
 */
export const createProjectRequestWithDependencies = async (
  req,
  res,
  {
    projectModel = Project,
    leadModel = Lead,
    userModel = User,
    uploadBill = uploadCurrentBill,
    estimateProject = calculateSolarEstimate,
  } = {}
) => {
  const authenticatedUser = req.user;
  const authenticatedCustomerId = authenticatedUser?._id || authenticatedUser?.id;

  if (!authenticatedCustomerId || authenticatedUser?.role !== 'user') {
    throw new AppError('You must sign up or sign in to send a quote request.', 401);
  }

  const {
    location,
    monthlyBill,
    propertyType,
    systemPreference,
    budget,
    companyId,
    estimateInputs,
  } = req.body;

  const customerId = authenticatedCustomerId;
  if (estimateInputs && propertyType && estimateInputs.propertyType !== propertyType) {
    throw new AppError('Project propertyType must match estimateInputs.propertyType.', 400, true, 'INVALID_ESTIMATE_INPUT');
  }
  if (estimateInputs && estimateInputs.location.trim().toLowerCase() !== location.trim().toLowerCase()) {
    throw new AppError('Project location must match estimateInputs.location.', 400, true, 'INVALID_ESTIMATE_INPUT');
  }

  assertObjectId(customerId, 'customerId');
  if (companyId) assertObjectId(companyId, 'companyId');

  let selectedCompany;
  if (companyId) {
    selectedCompany = await userModel.findOne({
      _id: companyId,
      role: { $in: ['install-co', 'seller-co'] },
    }).select('_id').lean();
    if (!selectedCompany) {
      throw new AppError(`Company '${companyId}' does not exist.`, 404, true, 'COMPANY_NOT_FOUND');
    }
  }

  const currentBillUrl = req.file ? await uploadBill(req.file) : null;

  const estimate = estimateInputs ? estimateProject(estimateInputs) : null;
  const createdAt = new Date();
  const trackingHistory = [{
    status: 'project-created',
    message: 'Project request received.',
    actorId: authenticatedCustomerId,
    actorRole: 'user',
    createdAt,
  }];
  if (selectedCompany) {
    trackingHistory.push({
      status: 'vendor-selected',
      message: 'A vendor was selected for this project.',
      actorId: authenticatedCustomerId,
      actorRole: 'user',
      createdAt,
    });
  }

  const project = await projectModel.create({
    customerId: customerId || undefined,
    userId: customerId || undefined,
    location,
    monthlyBill,
    propertyType: propertyType || estimateInputs?.propertyType,
    systemPreference,
    budget,
    companyId: selectedCompany?._id,
    estimate,
    currentBillUrl,
    ...(req.file && {
      currentBillOriginalName: req.file.originalname,
      currentBillMimeType: req.file.mimetype,
      currentBillUploadedAt: new Date(),
    }),
    status: 'pending',
    trackingStatus: selectedCompany ? 'vendor-selected' : 'project-created',
    trackingHistory,
  });

  // A selected company receives only its own lead; without a selection the
  // existing marketplace-wide distribution behavior is preserved.
  const companies = selectedCompany
    ? [selectedCompany]
    : await userModel.find({ role: { $in: ['install-co', 'seller-co'] } }).select('_id').lean();
  const leads = companies.map((c) => ({
    companyId: c._id,
    projectId: project._id,
    customerId,
    status: 'new',
  }));
  if (leads.length) await leadModel.insertMany(leads);

  const projectResponse = {
    id: project._id?.toString?.() || project.id,
    customerId: project.customerId,
    location: project.location,
    monthlyBill: project.monthlyBill,
    propertyType: project.propertyType,
    systemPreference: project.systemPreference,
    budget: project.budget,
    currentBillUrl: project.currentBillUrl,
    estimate: project.estimate,
    trackingStatus: project.trackingStatus,
    trackingUrl: `/api/projects/${project._id}/tracking`,
    createdAt: project.createdAt,
  };

  sendSuccess(
    res,
    201,
    { project: projectResponse, distributedLeads: leads.length },
    'Project quote request created successfully'
  );
};

export const createProjectRequest = (req, res) => createProjectRequestWithDependencies(req, res);

/**
 * GET /api/projects/:projectId/quotes — companies' quotes on a project.
 *
 * Returns a normalized quote list the customer can compare. Fields are
 * snapshotted at quote-submission time by the company's controller.
 *
 * @param {import('express').Request} req
 *   req.params.projectId — Project ObjectId.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { projectId, quotes }, message, error }
 */
export const getProjectQuotes = async (req, res) => {
  const { projectId } = req.params;
  assertObjectId(projectId, 'projectId');

  const project = await Project.findById(projectId)
    .populate('quotes.companyId', 'name')
    .lean();

  if (!project) {
    throw new AppError(`Project '${projectId}' does not exist.`, 404);
  }

  const requesterId = String(req.user?._id || req.user?.id || '');
  const ownerId = String(project.userId || project.customerId || '');
  if (req.user?.role !== 'admin' && ownerId !== requesterId) {
    throw new AppError('You are not allowed to view quotes for this project.', 403, true, 'FORBIDDEN');
  }

  const quotes = (project.quotes || []).map((q) => ({
    id: q._id.toString(),
    leadId: q.leadId,
    companyId: q.companyId?._id?.toString() || q.companyId?.toString(),
    companyName: q.companyId?.name || q.companyName,
    estimatedPrice: q.estimatedPrice,
    isFinalVendorQuotation: true,
    status: q.status || 'submitted',
    warrantyYears: q.warrantyYears,
    notes: q.notes,
    submittedAt: q.submittedAt || project.updatedAt,
  }));

  sendSuccess(res, 200, { projectId, quotes, count: quotes.length }, 'Company quotes fetched.');
};

const populateTrackingProject = (query) => query
  .populate('companyId', 'name businessName role')
  .populate('userId', 'name');

const toTrackingResponse = (project) => {
  const vendor = project.companyId && typeof project.companyId === 'object'
    ? {
        id: project.companyId._id.toString(),
        name: project.companyId.businessName || project.companyId.name,
        type: project.companyId.role,
      }
    : null;
  return {
    projectId: project._id.toString(),
    vendor,
    status: project.trackingStatus || 'project-created',
    statusLabel: PROJECT_LIFECYCLE.find(({ status }) => status === project.trackingStatus)?.label || 'Project Created',
    progressPercent: lifecycleProgress(project.trackingStatus || 'project-created'),
    expectedCompletionAt: project.expectedCompletionAt || null,
    history: (project.trackingHistory || []).map((event) => ({
      id: event._id?.toString(),
      status: event.status,
      statusLabel: PROJECT_LIFECYCLE.find(({ status }) => status === event.status)?.label || event.status,
      message: event.message || null,
      important: Boolean(event.important),
      createdAt: event.createdAt,
    })),
  };
};

export const getCustomerProjects = async (req, res) => {
  const customerId = req.user._id || req.user.id;
  const projects = await populateTrackingProject(
    Project.find({ userId: customerId }).sort({ createdAt: -1 })
  ).lean();
  sendSuccess(res, 200, {
    items: projects.map((project) => ({
      ...toTrackingResponse(project),
      location: project.location,
      propertyType: project.propertyType,
      createdAt: project.createdAt,
    })),
  }, 'Customer projects fetched.');
};

export const getProjectTracking = async (req, res) => {
  assertObjectId(req.params.projectId, 'projectId');
  const project = await populateTrackingProject(Project.findById(req.params.projectId)).lean();
  if (!project) throw new AppError('Project not found.', 404);

  const requesterId = String(req.user._id || req.user.id);
  const ownerId = String(project.userId || project.customerId || '');
  const vendorId = String(project.companyId?._id || project.companyId || '');
  const authorized = req.user.role === 'admin'
    || (req.user.role === 'user' && ownerId === requesterId)
    || (['seller-co', 'install-co'].includes(req.user.role) && vendorId === requesterId);
  if (!authorized) throw new AppError('You are not allowed to view this project.', 403, true, 'FORBIDDEN');

  sendSuccess(res, 200, {
    ...toTrackingResponse(project),
    location: project.location,
    propertyType: project.propertyType,
    createdAt: project.createdAt,
    estimate: project.estimate || null,
  }, 'Project tracking fetched.');
};

export const getVendorProjects = async (req, res) => {
  const companyId = req.user._id || req.user.id;
  const projects = await populateTrackingProject(
    Project.find({ companyId }).sort({ updatedAt: -1 })
  ).lean();
  sendSuccess(res, 200, {
    items: projects.map((project) => ({
      ...toTrackingResponse(project),
      location: project.location,
      propertyType: project.propertyType,
      systemPreference: project.systemPreference,
      monthlyBill: project.monthlyBill,
      budget: project.budget,
      estimate: project.estimate || null,
    })),
  }, 'Vendor projects fetched.');
};

export const updateProjectTrackingWithDependencies = async (
  req,
  res,
  { projectModel = Project } = {},
) => {
  const { projectId } = req.params;
  assertObjectId(projectId, 'projectId');
  const { status, message, important = false, expectedCompletionAt } = req.body;
  const actorId = req.user._id || req.user.id;
  const now = new Date();

  const project = await projectModel.findById(projectId).select('companyId trackingStatus expectedCompletionAt');
  if (!project) throw new AppError('Project not found.', 404);
  if (
    req.user.role !== 'admin'
    && String(project.companyId || '') !== String(actorId)
  ) {
    throw new AppError('Only the assigned vendor or an administrator may update this project.', 403, true, 'FORBIDDEN');
  }

  const currentStatus = project.trackingStatus || 'project-created';
  const currentIndex = PROJECT_LIFECYCLE_STATUSES.indexOf(currentStatus);
  const nextStatus = status || currentStatus;
  if (status === 'quote-approved') {
    throw new AppError('Only the customer may approve a vendor quotation.', 403, true, 'FORBIDDEN');
  }
  if (status && (
    currentIndex < 0
    || PROJECT_LIFECYCLE_STATUSES[currentIndex + 1] !== status
  )) {
    throw new AppError('Project status must advance exactly one lifecycle step.', 409, true, 'INVALID_PROJECT_TRANSITION');
  }
  const update = {};
  if (status) update.trackingStatus = status;
  if (status === 'project-completed') update.status = 'completed';
  if (expectedCompletionAt !== undefined) update.expectedCompletionAt = expectedCompletionAt || null;
  const event = {
    status: nextStatus,
    message: message || (status
      ? `Project status updated to ${PROJECT_LIFECYCLE.find((entry) => entry.status === status).label}.`
      : undefined),
    important,
    actorId,
    actorRole: req.user.role,
    createdAt: now,
  };

  const updatedProject = await projectModel.findOneAndUpdate(
    { _id: projectId, trackingStatus: currentStatus },
    { $set: update, $push: { trackingHistory: event } },
    { new: true, runValidators: true },
  );
  if (!updatedProject) {
    throw new AppError('Project changed concurrently; reload and try again.', 409, true, 'PROJECT_UPDATE_CONFLICT');
  }
  sendSuccess(res, 200, {
    ...toTrackingResponse(updatedProject),
    location: updatedProject.location,
  }, 'Project tracking updated.');
};

export const updateProjectTracking = (req, res) => updateProjectTrackingWithDependencies(req, res);

export const approveProjectQuoteWithDependencies = async (
  req,
  res,
  { projectModel = Project, leadModel = Lead } = {},
) => {
  const { projectId, quoteId } = req.params;
  assertObjectId(projectId, 'projectId');
  assertObjectId(quoteId, 'quoteId');
  const customerId = req.user._id || req.user.id;
  const now = new Date();
  const currentProject = await projectModel.findOne({
    _id: projectId,
    userId: customerId,
    trackingStatus: { $in: ['project-created', 'vendor-selected'] },
    quotes: { $elemMatch: { _id: quoteId, status: 'submitted' } },
  }).select('quotes trackingStatus');
  if (!currentProject) {
    throw new AppError('Submitted quote not found for this customer project.', 404);
  }

  const quote = currentProject.quotes.id(quoteId);
  const vendorSelected = currentProject.trackingStatus === 'project-created';
  const history = [];
  if (vendorSelected) {
    history.push({
      _id: new mongoose.Types.ObjectId(),
      status: 'vendor-selected',
      message: 'Customer selected a vendor quote.',
      actorId: customerId,
      actorRole: 'user',
      createdAt: now,
    });
  }
  history.push({
    _id: new mongoose.Types.ObjectId(),
    status: 'quote-approved',
    message: 'Customer approved the vendor quotation.',
    actorId: customerId,
    actorRole: 'user',
    createdAt: now,
  });

  const approved = await projectModel.findOneAndUpdate(
    {
      _id: projectId,
      userId: customerId,
      trackingStatus: currentProject.trackingStatus,
      quotes: { $elemMatch: { _id: quoteId, status: 'submitted' } },
    },
    [{
      $set: {
        companyId: quote.companyId,
        trackingStatus: 'quote-approved',
        status: 'in-progress',
        quotes: {
          $map: {
            input: { $ifNull: ['$quotes', []] },
            as: 'candidateQuote',
            in: {
              $mergeObjects: [
                '$$candidateQuote',
                {
                  status: {
                    $cond: [
                      { $eq: ['$$candidateQuote._id', quote._id] },
                      'accepted',
                      {
                        $cond: [
                          { $eq: ['$$candidateQuote.status', 'submitted'] },
                          'lost',
                          '$$candidateQuote.status',
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
        trackingHistory: {
          $concatArrays: [
            { $ifNull: ['$trackingHistory', []] },
            { $literal: history },
          ],
        },
      },
    }],
    { new: true },
  );
  if (!approved) {
    throw new AppError('Quote approval conflicted with another project update.', 409, true, 'PROJECT_UPDATE_CONFLICT');
  }

  await leadModel.updateOne({ _id: quote.leadId, projectId }, { $set: { status: 'won' } });
  await leadModel.updateMany(
    { projectId, _id: { $ne: quote.leadId }, status: { $nin: ['won', 'lost', 'rejected'] } },
    { $set: { status: 'lost' } },
  );

  sendSuccess(res, 200, {
    projectId,
    vendorId: quote.companyId.toString(),
    status: 'quote-approved',
    statusLabel: 'Quote Approved',
    progressPercent: lifecycleProgress('quote-approved'),
  }, 'Vendor quotation approved.');
};

export const approveProjectQuote = (req, res) => approveProjectQuoteWithDependencies(req, res);