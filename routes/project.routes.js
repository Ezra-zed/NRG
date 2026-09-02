import { Router } from 'express';
import Joi from 'joi';
import { createProjectRequest, getProjectQuotes } from '../controllers/project.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Customer project / quote routes.
 */

const router = Router();

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({ 'string.pattern.base': 'Must be a valid 24-char ObjectId' });

const projectRequestSchema = Joi.object({
  customerId: objectId.optional(),
  location: Joi.string().trim().min(2).required().messages({ 'string.min': 'location is required' }),
  monthlyBill: Joi.number().min(0).optional(),
  propertyType: Joi.string().valid('residential', 'commercial', 'industrial', 'other').optional(),
  systemPreference: Joi.string().valid('on-grid', 'off-grid', 'hybrid-grid').optional(),
  budget: Joi.number().min(0).optional(),
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