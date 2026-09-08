import { Router } from 'express';
import Joi from 'joi';
import {
  getAdminDashboard,
  verifyCompany,
  getAdminManagement,
  getAdminLeads,
} from '../controllers/admin.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import authenticate, { requireAdmin } from '../middlewares/auth.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Admin control-centre routes.
 * Require a valid Bearer token (any authenticated user for this contract).
 */

const router = Router();

const verificationBadges = ['GST Verified', 'Business Verified', 'Installer Verified', 'Top Rated'];

const verifySchema = Joi.object({
  verificationBadges: Joi.array().items(Joi.string().valid(...verificationBadges)).default([]),
});

const adminLeadsQuerySchema = Joi.object({
  page: Joi.number().integer().positive().optional(),
  limit: Joi.number().integer().positive().max(100).optional(),
  search: Joi.string().trim().max(100).optional(),
  status: Joi.string().valid('new', 'accepted', 'contacted', 'site-visit', 'quote-submitted', 'won', 'lost', 'rejected').optional(),
  customerId: Joi.string().hex().length(24).optional(),
  companyId: Joi.string().hex().length(24).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});

/**
 * GET /api/admin/dashboard — marketplace metrics.
 */
router.get('/dashboard', authenticate, requireAdmin, asyncHandler(getAdminDashboard));

/**
 * PUT /api/admin/companies/:companyId/verify — apply verification badges.
 */
router.put(
  '/companies/:companyId/verify',
  authenticate,
  requireAdmin,
  validate(verifySchema),
  asyncHandler(verifyCompany)
);

/**
 * GET /api/admin/management — operational data.
 */
router.get('/management', authenticate, requireAdmin, asyncHandler(getAdminManagement));

router.get('/leads', authenticate, requireAdmin, validate(adminLeadsQuerySchema, 'query'), asyncHandler(getAdminLeads));

export default router;