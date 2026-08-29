import { Router } from 'express';
import { z } from 'zod';
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

const leadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(leadStatusEnum).optional(),
});

const updateLeadSchema = z
  .object({
    status: z.enum(leadStatusEnum).optional(),
    quote: z
      .object({
        estimatedPrice: z.coerce.number().min(0),
        warrantyYears: z.coerce.number().min(0).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .optional(),
  })
  .refine((b) => b.status !== undefined || (b.quote !== undefined && Object.keys(b.quote).length > 0), {
    message: 'Provide either status or quote to update the lead.',
    path: ['body'],
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