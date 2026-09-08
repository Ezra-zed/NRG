import mongoose from 'mongoose';
import Project from '../models/Project.model.js';
import Lead from '../models/Lead.model.js';
import User from '../models/User.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { uploadCurrentBill } from '../services/currentBill.service.js';

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
  } = req.body;

  const customerId = authenticatedCustomerId;

  console.log('[PROJECT_REQUEST][CONTROLLER_START]', JSON.stringify({
    method: req.method,
    url: req.originalUrl,
    bodyKeys: Object.keys(req.body || {}),
    hasFile: Boolean(req.file),
    file: req.file ? {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer?.length,
    } : null,
  }));

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

  console.log('[PROJECT_REQUEST][UPLOAD_STEP]', JSON.stringify({ willUpload: Boolean(req.file) }));
  const currentBillUrl = req.file ? await uploadBill(req.file) : null;
  console.log('[PROJECT_REQUEST][UPLOAD_COMPLETE]', JSON.stringify({
    uploaded: Boolean(req.file),
    hasCurrentBillUrl: Boolean(currentBillUrl),
  }));

  const project = await projectModel.create({
    customerId: customerId || undefined,
    userId: customerId || undefined,
    location,
    monthlyBill,
    propertyType,
    systemPreference,
    budget,
    companyId: selectedCompany?._id,
    currentBillUrl,
    ...(req.file && {
      currentBillOriginalName: req.file.originalname,
      currentBillMimeType: req.file.mimetype,
      currentBillUploadedAt: new Date(),
    }),
    status: 'pending',
  });

  // A selected company receives only its own lead; without a selection the
  // existing marketplace-wide distribution behavior is preserved.
  const companies = selectedCompany
    ? [selectedCompany]
    : await userModel.find({ role: { $in: ['install-co', 'seller-co'] } }).select('_id').lean();
  const leads = companies.map((c) => ({
    companyId: c._id,
    projectId: project._id,
    status: 'new',
  }));
  if (leads.length) await leadModel.insertMany(leads);

  console.log('[PROJECT_REQUEST][COMPLETE]', JSON.stringify({
    projectId: project._id,
    distributedLeads: leads.length,
  }));

  const projectResponse = {
    id: project._id?.toString?.() || project.id,
    customerId: project.customerId,
    location: project.location,
    monthlyBill: project.monthlyBill,
    propertyType: project.propertyType,
    systemPreference: project.systemPreference,
    budget: project.budget,
    currentBillUrl: project.currentBillUrl,
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
    warrantyYears: q.warrantyYears,
    notes: q.notes,
    submittedAt: q.submittedAt || project.updatedAt,
  }));

  sendSuccess(res, 200, { projectId, quotes, count: quotes.length }, 'Company quotes fetched.');
};