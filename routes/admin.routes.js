import { Router } from 'express';
import { z } from 'zod';
import {
  getAdminDashboard,
  verifyCompany,
  getAdminManagement,
} from '../controllers/admin.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import authenticate from '../middlewares/auth.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Admin control-centre routes.
 * Require a valid Bearer token (any authenticated user for this contract).
 */

const router = Router();

const verificationBadges = ['GST Verified', 'Business Verified', 'Installer Verified', 'Top Rated'];

const verifySchema = z.object({
  verificationBadges: z.array(z.enum(verificationBadges)).default([]),
});

/**
 * GET /api/admin/dashboard — marketplace metrics.
 */
router.get('/dashboard', authenticate, asyncHandler(getAdminDashboard));

/**
 * PUT /api/admin/companies/:companyId/verify — apply verification badges.
 */
router.put(
  '/companies/:companyId/verify',
  authenticate,
  validate(verifySchema),
  asyncHandler(verifyCompany)
);

/**
 * GET /api/admin/management — operational data.
 */
router.get('/management', authenticate, asyncHandler(getAdminManagement));

export default router;