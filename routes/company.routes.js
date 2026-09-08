import { Router } from 'express';
import Joi from 'joi';
import {
  upsertCompanyProfile,
  getPublicCompanies,
  getCompanyLeads,
  updateLead,
  getCompanyMetrics,
} from '../controllers/company.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import authenticate, { requireCompany } from '../middlewares/auth.middleware.js';
import { upload } from '../utils/upload.js';
import asyncHandler from '../utils/asyncHandler.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';

/**
 * Public company directory plus authenticated lead-management and profile routes.
 * Authenticated company identity is taken from the token (req.user).
 */

const router = Router();

const publicCompaniesQuerySchema = Joi.object({
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
  role: Joi.string().valid('install-co', 'seller-co').optional(),
  search: Joi.string().trim().max(100).optional(),
  location: Joi.string().trim().max(100).optional(),
});

router.get('/', validate(publicCompaniesQuerySchema, 'query'), asyncHandler(getPublicCompanies));

const leadStatusEnum = ['new', 'accepted', 'contacted', 'site-visit', 'quote-submitted', 'won', 'lost', 'rejected'];

const leadsQuerySchema = Joi.object({
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
  status: Joi.string().valid(...leadStatusEnum).optional(),
});

const updateLeadSchema = Joi.object({
    status: Joi.string().valid(...leadStatusEnum).optional(),
    quote: Joi.object({
        estimatedPrice: Joi.number().min(0).required(),
        warrantyYears: Joi.number().min(0).optional(),
        notes: Joi.string().trim().max(1000).optional(),
      })
      .min(1)
      .optional(),
  }).or('status', 'quote').messages({
    'object.missing': 'Provide either status or quote to update the lead.',
  });

/**
 * POST /api/companies/profile — multipart/form-data.
 *   fields:  installExperienceYears, serviceLocations, products, brands, pricingPackages (JSON)
 *   files:   gstCertificate, businessRegistration, completedProjectPhotos (array)
 */
router.post(
  '/profile',
  authenticate,
  requireCompany,
  upload.fields([
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'businessRegistration', maxCount: 1 },
    { name: 'completedProjectPhotos', maxCount: 10 },
  ]),
  asyncHandler(upsertCompanyProfile)
);

/**
 * POST /api/companies/profile/setup — save the logged-in company's profile.
 * Uses the same multipart fields and upsert behavior as the legacy profile route.
 */
router.post(
  '/profile/setup',
  authenticate,
  requireCompany,
  upload.fields([
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'businessRegistration', maxCount: 1 },
    { name: 'completedProjectPhotos', maxCount: 10 },
  ]),
  asyncHandler(upsertCompanyProfile)
);

/**
 * GET /api/companies/leads — the logged-in company's lead list.
 */
router.get('/leads', authenticate, requireCompany, validate(leadsQuerySchema, 'query'), asyncHandler(getCompanyLeads));

/**
 * PUT /api/companies/leads/:leadId — update pipeline status / submit quote.
 */
router.put('/leads/:leadId', authenticate, requireCompany, rateLimit({ max: 30 }), validate(updateLeadSchema), asyncHandler(updateLead));

/**
 * GET /api/companies/metrics — sales funnel totals for the logged-in company.
 */
router.get('/metrics', authenticate, requireCompany, asyncHandler(getCompanyMetrics));

export default router;