import { Router } from 'express';
import Joi from 'joi';
import {
  upsertCompanyProfile,
  getCompanyLeads,
  updateLead,
  getCompanyMetrics,
} from '../controllers/company.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import authenticate from '../middlewares/auth.middleware.js';
import { upload } from '../utils/upload.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Company lead-management & profile routes.
 * All routes require a valid Bearer token; the company identity is taken from
 * the token (req.user).
 */

const router = Router();

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
router.get('/leads', authenticate, validate(leadsQuerySchema, 'query'), asyncHandler(getCompanyLeads));

/**
 * PUT /api/companies/leads/:leadId — update pipeline status / submit quote.
 */
router.put('/leads/:leadId', authenticate, validate(updateLeadSchema), asyncHandler(updateLead));

/**
 * GET /api/companies/metrics — sales funnel totals for the logged-in company.
 */
router.get('/metrics', authenticate, asyncHandler(getCompanyMetrics));

export default router;