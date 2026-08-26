import mongoose from 'mongoose';
import Project from '../models/Project.model.js';
import Lead from '../models/Lead.model.js';
import User from '../models/User.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';

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
export const createProjectRequest = async (req, res) => {
  const {
    location,
    monthlyBill,
    propertyType,
    systemPreference,
    budget,
    customerId,
  } = req.body;

  if (customerId) assertObjectId(customerId, 'customerId');

  const project = await Project.create({
    customerId: customerId || undefined,
    location,
    monthlyBill,
    propertyType,
    systemPreference,
    budget,
    status: 'pending',
  });

  // Distribute a lead to every registered installer/seller company so the
  // company lead dashboard has something to list.
  const companies = await User.find({ role: { $in: ['install-co', 'seller-co'] } }).select('_id').lean();
  const leads = companies.map((c) => ({ companyId: c._id, projectId: project._id, status: 'new' }));
  if (leads.length) await Lead.insertMany(leads);

  sendSuccess(
    res,
    201,
    { project, distributedLeads: leads.length },
    `Project request created & queued to ${leads.length} companies.`
  );
};

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

  const quotes = (project.quotes || []).map((q) => ({
    id: q._id.toString(),
    company: {
      id: q.companyId?._id?.toString() || q.companyId?.toString(),
      name: q.companyId?.name || q.companyName,
    },
    rating: q.rating,
    experience: q.yearsExperience,
    estimatedPrice: q.estimatedPrice,
    warranty: q.warrantyYears,
    verified: q.verified,
    status: q.status,
  }));

  sendSuccess(res, 200, { projectId, quotes, count: quotes.length }, 'Company quotes fetched.');
};