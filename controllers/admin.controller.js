import User from '../models/User.model.js';
import Lead from '../models/Lead.model.js';
import Project from '../models/Project.model.js';
import Complaint from '../models/Complaint.model.js';
import CompanyProfile from '../models/CompanyProfile.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { assertObjectId } from './project.controller.js';

/**
 * GET /api/admin/dashboard — high-level marketplace metrics for the control centre.
 *
 * Commission figures are projected at a flat 10% of quote value; the "earned"
 * variant counts won quotes, "pending" counts submitted-but-not-won quotes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { totals }, message, error }
 */
export const getAdminDashboard = async (req, res) => {
  const COMMISSION_RATE = 0.1;

  const [
    totalCustomers,
    totalCompanies,
    verifiedCompanies,
    newLeads,
    activeProjects,
    completedProjects,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: { $in: ['seller-co', 'install-co'] } }),
    CompanyProfile.countDocuments({ verified: true }),
    Lead.countDocuments({ status: { $in: ['new', 'accepted'] } }),
    Project.countDocuments({ status: { $in: ['pending', 'quoted', 'in-progress'] } }),
    Project.countDocuments({ status: 'completed' }),
  ]);

  // Sum of quote values per status.
  const valueRows = await Project.aggregate([
    { $unwind: '$quotes' },
    { $group: { _id: '$quotes.status', sum: { $sum: '$quotes.estimatedPrice' } } },
  ]);
  const sumByStatus = (valueRows || []).reduce((acc, r) => {
    acc[r._id || 'submitted'] = r.sum || 0;
    return acc;
  }, {});
  const wonValue = sumByStatus.won || 0;
  const submittedValue = sumByStatus.submitted || 0;
  const projectValue = wonValue + submittedValue;
  const commissionEarned = Math.round(wonValue * COMMISSION_RATE);
  const pendingCommission = Math.round(submittedValue * COMMISSION_RATE);

  sendSuccess(
    res,
    200,
    {
      totals: {
        totalCustomers,
        totalCompanies,
        verifiedCompanies,
        newLeads,
        activeProjects,
        completedProjects,
        projectValue,
        commissionEarned,
        pendingCommission,
      },
      meta: { commissionRate: COMMISSION_RATE },
    },
    'Dashboard metrics fetched.'
  );
};

/**
 * PUT /api/admin/companies/:companyId/verify — apply verification badges to a
 * company. Setting any badge flips `verified` to true.
 *
 * @param {import('express').Request} req
 *   req.params.companyId — company (User) ObjectId.
 *   req.body — { verificationBadges: string[] } from the allowed badge set.
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: CompanyProfile, message, error }
 */
export const verifyCompany = async (req, res) => {
  const { companyId } = req.params;
  const { verificationBadges = [] } = req.body || {};

  assertObjectId(companyId, 'companyId');

  const user = await User.findById(companyId).lean();
  if (!user || !['seller-co', 'install-co'].includes(user.role)) {
    throw new AppError(`Company '${companyId}' does not exist.`, 404);
  }

  const profile = await CompanyProfile.findOneAndUpdate(
    { companyId },
    { $set: { verificationBadges, verified: verificationBadges.length > 0 }, $setOnInsert: { companyId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, 200, profile, 'Company verification updated.');
};

/**
 * GET /api/admin/management — operational data: company performance, customer
 * complaints and payment tracking.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { companies, complaints, payments }, message, error }
 */
export const getAdminManagement = async (req, res) => {
  const [companies, complaints] = await Promise.all([
    CompanyProfile.find()
      .populate('companyId', 'name email role phone')
      .sort({ createdAt: -1 })
      .lean(),
    Complaint.find()
      .populate('userId', 'name email phone')
      .populate('companyId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const companyPerformance = companies.map((p) => ({
    id: p._id.toString(),
    company: p.companyId
      ? {
          id: p.companyId._id?.toString(),
          name: p.companyId.name,
          email: p.companyId.email,
          role: p.companyId.role,
          phone: p.companyId.phone,
        }
      : null,
    rating: p.rating,
    ratingCount: p.ratingCount,
    verificationBadges: p.verificationBadges,
    verified: p.verified,
    installExperienceYears: p.installExperienceYears,
    serviceLocations: p.serviceLocations,
    updatedAt: p.updatedAt,
  }));

  sendSuccess(
    res,
    200,
    {
      companies: companyPerformance,
      complaints,
      payments: [], // No payment ledger exists in this backend yet — reserved shape.
    },
    'Management data fetched.'
  );
};