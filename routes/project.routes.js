import { Router } from 'express';
import Joi from 'joi';
import {
  approveProjectQuote,
  createProjectRequest,
  getCustomerProjects,
  getProjectQuotes,
  getProjectTracking,
  getVendorProjects,
  updateProjectTracking,
} from '../controllers/project.controller.js';
import authenticate, {
  requireAdminOrCompany,
  requireCustomer,
  requireVerifiedCompany,
} from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { currentBillUpload } from '../utils/upload.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { solarEstimateInputSchema } from '../schemas/solarEstimate.schema.js';

/**
 * Customer project / quote routes.
 */

const router = Router();

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({ 'string.pattern.base': 'Must be a valid 24-char ObjectId' });

const projectEstimateInputsSchema = Joi.alternatives().try(
  solarEstimateInputSchema,
  Joi.string().custom((input, helpers) => {
    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch {
      return helpers.error('any.invalid');
    }
    const validation = solarEstimateInputSchema.validate(parsed);
    if (validation.error) return helpers.error('any.invalid');
    return validation.value;
  }),
);

export const projectRequestSchema = Joi.object({
  customerId: objectId.optional(),
  location: Joi.string().trim().min(2).required().messages({ 'string.min': 'location is required' }),
  monthlyBill: Joi.number().min(0).optional(),
  propertyType: Joi.string().valid('residential', 'commercial', 'industrial', 'other').optional(),
  systemPreference: Joi.string().valid('on-grid', 'off-grid', 'hybrid-grid').optional(),
  budget: Joi.number().min(0).optional(),
  companyId: objectId.optional(),
  estimateInputs: projectEstimateInputsSchema.optional(),
});

/**
 * POST /api/projects/request — submit a "Get Solar Quote" request.
 */
router.post('/request', authenticate, requireCustomer, rateLimit({ max: 10 }), currentBillUpload.single('currentBill'), validate(projectRequestSchema), asyncHandler(createProjectRequest));

const projectIdParams = Joi.object({ projectId: objectId.required() });
const quoteParams = Joi.object({ projectId: objectId.required(), quoteId: objectId.required() });
const trackingUpdateSchema = Joi.object({
  status: Joi.string().valid(
    'vendor-selected',
    'quote-approved',
    'bulk-purchase-completed',
    'materials-ready',
    'vendor-ready-for-installation',
    'installation-scheduled',
    'installation-in-progress',
    'installation-completed',
    'testing-and-handover',
    'project-completed',
  ).optional(),
  message: Joi.string().trim().max(1000).allow('').optional(),
  important: Joi.boolean().default(false),
  expectedCompletionAt: Joi.date().iso().min('now').allow(null).optional(),
}).or('status', 'message', 'expectedCompletionAt');

router.get('/mine/tracking', authenticate, requireCustomer, asyncHandler(getCustomerProjects));
router.get('/vendor/tracking', authenticate, requireVerifiedCompany, asyncHandler(getVendorProjects));
router.patch(
  '/:projectId/tracking',
  authenticate,
  requireAdminOrCompany,
  rateLimit({ max: 30 }),
  validate(projectIdParams, 'params'),
  validate(trackingUpdateSchema),
  asyncHandler(updateProjectTracking),
);
router.get(
  '/:projectId/tracking',
  authenticate,
  validate(projectIdParams, 'params'),
  asyncHandler(getProjectTracking),
);
router.post(
  '/:projectId/quotes/:quoteId/approve',
  authenticate,
  requireCustomer,
  validate(quoteParams, 'params'),
  asyncHandler(approveProjectQuote),
);

/**
 * GET /api/projects/:projectId/quotes — companies' quotes for comparison.
 */
router.get('/:projectId/quotes', authenticate, validate(projectIdParams, 'params'), asyncHandler(getProjectQuotes));

export default router;