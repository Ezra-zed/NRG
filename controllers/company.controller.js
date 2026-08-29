import User from '../models/User.model.js';
import Lead from '../models/Lead.model.js';
import Project from '../models/Project.model.js';
import CompanyProfile from '../models/CompanyProfile.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { publicFileUrl } from '../utils/upload.js';
import { assertObjectId } from './project.controller.js';

export const upsertCompanyProfile = async (req, res) => {
  const companyId = req.user._id || req.user.id;
  const body = req.body || {};
  const files = req.files || {};

  const profile = (await CompanyProfile.findOne({ companyId })) || new CompanyProfile({ companyId });

  if (body.installExperienceYears !== undefined && body.installExperienceYears !== '') {
    profile.installExperienceYears = Number(body.installExperienceYears);
  }

  const toArray = (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(String).filter(Boolean); } catch {}
      return v.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return undefined;
  };

  const svc = toArray(body.serviceLocations);
  if (svc !== undefined) profile.serviceLocations = svc;
  const prods = toArray(body.products);
  if (prods !== undefined) profile.products = prods;
  const br = toArray(body.brands);
  if (br !== undefined) profile.brands = br;

  if (body.pricingPackages !== undefined && body.pricingPackages !== '') {
    try {
      const arr = typeof body.pricingPackages === 'string' ? JSON.parse(body.pricingPackages) : body.pricingPackages;
      if (Array.isArray(arr)) profile.pricingPackages = arr;
    } catch {}
  }

  if (files.gstCertificate?.[0]) profile.gstCertificate = publicFileUrl(files.gstCertificate[0].filename);
  if (files.businessRegistration?.[0]) profile.businessRegistration = publicFileUrl(files.businessRegistration[0].filename);
  if (files.completedProjectPhotos?.length) {
    profile.completedProjectPhotos = files.completedProjectPhotos.map((f) => publicFileUrl(f.filename));
  }

  profile.verified = (profile.verificationBadges || []).length > 0;
  await profile.save();

  sendSuccess(res, 200, profile, 'Company profile saved.');
};

export const getCompanyLeads = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const filter = { companyId: req.user._id || req.user.id };
  if (status) filter.status = status;

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .populate('projectId', 'location systemPreference monthlyBill budget status createdAt')
      .populate({ path: 'projectId.customerId', select: 'name mobile email location pincode' })
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  const items = leads.map((l) => ({
    id: l._id.toString(),
    status: l.status,
    quote: l.quote || null,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    project: l.projectId
      ? {
          id: l.projectId._id.toString(),
          location: l.projectId.location,
          systemPreference: l.projectId.systemPreference,
          monthlyBill: l.projectId.monthlyBill,
          budget: l.projectId.budget,
          projectStatus: l.projectId.status,
          createdAt: l.projectId.createdAt,
          customer: l.projectId.customerId
            ? {
                id: l.projectId.customerId._id.toString(),
                name: l.projectId.customerId.name,
                mobile: l.projectId.customerId.mobile,
                email: l.projectId.customerId.email,
                location: l.projectId.customerId.location,
                pincode: l.projectId.customerId.pincode,
              }
            : null,
        }
      : null,
  }));

  sendSuccess(
    res,
    200,
    {
      items,
      pagination: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    },
    'Leads fetched.'
  );
};

export const updateLead = async (req, res) => {
  const { leadId } = req.params;
  const { status, quote } = req.body;
  assertObjectId(leadId, 'leadId');

  const companyId = req.user._id || req.user.id;
  const lead = await Lead.findOne({ _id: leadId, companyId });
  if (!lead) {
    throw new AppError(`Lead '${leadId}' not found for this company.`, 404);
  }

  if (status !== undefined) lead.status = status;

  if (quote !== undefined && quote !== null && Object.keys(quote).length) {
    lead.quote = {
      estimatedPrice: Number(quote.estimatedPrice),
      warrantyYears: quote.warrantyYears !== undefined ? Number(quote.warrantyYears) : 0,
      notes: quote.notes || '',
      submittedAt: new Date(),
    };
    if (!status || status === 'new') lead.status = 'quote-submitted';
    await syncQuoteToProject(lead, quote);
  }

  await lead.save();
  sendSuccess(res, 200, lead, 'Lead updated.');
};

const syncQuoteToProject = async (lead, quote) => {
  const project = await Project.findById(lead.projectId);
  if (!project) return;

  const companyId = lead.companyId;
  const [companyUser, profile] = await Promise.all([
    User.findById(companyId).select('name').lean(),
    CompanyProfile.findOne({ companyId }).lean(),
  ]);

  const alreadyQuoted = (project.quotes || []).some(
    (q) => q.companyId && q.companyId.toString() === companyId.toString()
  );
  if (!alreadyQuoted) {
    project.quotes.push({
      companyId,
      companyName: companyUser?.name || 'Company',
      rating: profile?.rating || 0,
      yearsExperience: profile?.installExperienceYears || 0,
      verified: Boolean(profile?.verified),
      estimatedPrice: Number(quote.estimatedPrice),
      warrantyYears: quote.warrantyYears !== undefined ? Number(quote.warrantyYears) : 0,
      status: 'submitted',
    });
    if (project.status === 'pending') project.status = 'quoted';
    await project.save();
  }
};

export const getCompanyMetrics = async (req, res) => {
  const companyId = req.user._id || req.user.id;
  const base = { companyId };

  const [leads, contacted, siteVisits, quotes, won] = await Promise.all([
    Lead.countDocuments({ ...base, status: { $in: ['new', 'accepted'] } }),
    Lead.countDocuments({ ...base, status: 'contacted' }),
    Lead.countDocuments({ ...base, status: 'site-visit' }),
    Lead.countDocuments({ ...base, status: 'quote-submitted' }),
    Lead.countDocuments({ ...base, status: 'won' }),
  ]);

  const pipeline = [
    { label: 'Leads', value: leads },
    { label: 'Contacted', value: contacted },
    { label: 'Site Visits', value: siteVisits },
    { label: 'Quotes', value: quotes },
    { label: 'Projects Won', value: won },
  ];

  sendSuccess(
    res,
    200,
    { funnel: pipeline, totals: { leads, contacted, siteVisits, quotes, projectsWon: won } },
    'Company metrics fetched.'
  );
};
