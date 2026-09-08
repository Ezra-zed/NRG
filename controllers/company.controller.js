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

export const getPublicCompaniesWithDependencies = async (
  req,
  res,
  { userModel = User, profileModel = CompanyProfile } = {}
) => {
  const currentPage = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const { role, search } = req.query;
  const { location } = req.query;
  const normalizedSearch = typeof search === 'string' ? search.trim().toLowerCase() : '';

  const userFilter = { role: { $in: role ? [role] : ['install-co', 'seller-co'] } };
  const users = await userModel.find(userFilter).select('_id name businessName email role').lean();
  const profiles = await profileModel.find({ companyId: { $in: users.map((user) => user._id) } }).lean();
  const profilesByCompanyId = new Map(profiles.map((profile) => [profile.companyId.toString(), profile]));

  const companies = users
    .map((user) => {
      const profile = profilesByCompanyId.get(user._id.toString());
      if (!profile) return null;

      const name = user.businessName || user.name;
      const locations = profile.serviceLocations || [];
      const location = locations[0];
      const normalizedLocation = typeof req.query.location === 'string' ? req.query.location.trim().toLowerCase() : '';
      if (normalizedLocation && !locations.some((value) => String(value || '').toLowerCase().includes(normalizedLocation))) {
        return null;
      }
      if (normalizedSearch && ![name, ...locations].some((value) => String(value || '').toLowerCase().includes(normalizedSearch))) {
        return null;
      }

      return {
        id: user._id.toString(),
        name,
        ...(location ? { location } : {}),
        projectsCompleted: 0,
        verificationBadges: profile.verificationBadges || [],
        ...(user.email ? { email: user.email } : {}),
        role: user.role,
        rating: profile.rating ?? 0,
      };
    })
    .filter(Boolean);

  const total = companies.length;
  const start = (currentPage - 1) * pageSize;
  sendSuccess(
    res,
    200,
    {
      companies: companies.slice(start, start + pageSize),
      pagination: {
        page: currentPage,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize) || 1,
      },
    },
    'Companies fetched successfully'
  );
};

export const getPublicCompanies = (req, res) => getPublicCompaniesWithDependencies(req, res);

export const getCompanyLeads = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  const filter = { companyId: req.user._id || req.user.id };
  if (status) filter.status = status;

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .populate('projectId', 'location propertyType systemPreference monthlyBill budget status createdAt userId customerId')
      .populate({ path: 'projectId.userId', select: 'name phone email' })
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
          propertyType: l.projectId.propertyType,
          systemPreference: l.projectId.systemPreference,
          systemSize: l.projectId.systemPreference,
          monthlyBill: l.projectId.monthlyBill,
          budget: l.projectId.budget,
          projectStatus: l.projectId.status,
          createdAt: l.projectId.createdAt,
              customer: (l.projectId.userId || l.projectId.customerId)
            ? {
                id: (l.projectId.userId || l.projectId.customerId)._id.toString(),
                name: (l.projectId.userId || l.projectId.customerId).name,
                mobile: (l.projectId.userId || l.projectId.customerId).mobile || (l.projectId.userId || l.projectId.customerId).phone,
                email: (l.projectId.userId || l.projectId.customerId).email,
                location: (l.projectId.userId || l.projectId.customerId).location,
                pincode: (l.projectId.userId || l.projectId.customerId).pincode,
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
        pages: Math.ceil(total / pageSize) || 1,
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
      notes: quote.notes || '',
      leadId: lead._id,
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
