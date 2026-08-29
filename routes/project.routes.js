import { Router } from 'express';
import { z } from 'zod';
import { createProjectRequest, getProjectQuotes } from '../controllers/project.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Customer project / quote routes.
 */

const router = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24-char ObjectId');

const projectRequestSchema = z.object({
  customerId: objectId.optional(),
  location: z.string().trim().min(2, 'location is required'),
  monthlyBill: z.coerce.number().min(0).optional(),
  propertyType: z.enum(['residential', 'commercial', 'industrial', 'other']).optional(),
  systemPreference: z.enum(['on-grid', 'off-grid', 'hybrid-grid']).optional(),
  budget: z.coerce.number().min(0).optional(),
});

/**
 * POST /api/projects/request — submit a "Get Solar Quote" request.
 */
router.post('/request', validate(projectRequestSchema), asyncHandler(createProjectRequest));

/**
 * GET /api/projects/:projectId/quotes — companies' quotes for comparison.
 */
router.get('/:projectId/quotes', asyncHandler(getProjectQuotes));

export default router;