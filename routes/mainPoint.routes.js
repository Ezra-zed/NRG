import { Router } from 'express';
import Joi from 'joi';
import {
  listComplaints,
  createCallLog,
  createCompanyComplaint,
} from '../controllers/mainPoint/complaint.controller.js';
import { getInstallerCompany } from '../controllers/mainPoint/installerCompany.controller.js';
import { serveDocsUI, serveDocsSetup } from '../controllers/mainPoint/docs.controller.js';
import swaggerSpec from '../utils/swagger.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import authenticate, {
  requireAdminOrCompany,
  requireCustomer,
} from '../middlewares/auth.middleware.js';

/**
 * Main Point (core dashboard) routes.
 *
 * @swagger
 * tags:
 *   - name: Main Point
 *     description: Core dashboard — complaints, call logs, installer companies, docs
 */

const router = Router();

/** 24-hex-char MongoDB ObjectId. */
const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({ 'string.pattern.base': 'Must be a valid 24-char ObjectId' });

/**
 * GET /api/main-point/complain/listing — paginated complaints.
 */
const listingQuerySchema = Joi.object({
    page: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().positive().max(100).optional(),
    status: Joi.string().valid('open', 'in-progress', 'resolved', 'closed').optional(),
  });

router.get(
  '/complain/listing',
  authenticate,
  requireAdminOrCompany,
  validate(listingQuerySchema, 'query'),
  asyncHandler(listComplaints)
);

/**
 * POST /api/main-point/complain/call-log — record a follow-up call.
 */
const callLogBodySchema = Joi.object({
  complaintId: objectId.required(),
  notes: Joi.string().trim().min(1).max(2000).required().messages({ 'string.min': 'notes cannot be empty' }),
  calledBy: Joi.string().trim().min(1).max(100).optional().messages({ 'string.min': 'calledBy cannot be empty' }),
});

router.post(
  '/complain/call-log',
  authenticate,
  requireAdminOrCompany,
  validate(callLogBodySchema),
  asyncHandler(createCallLog)
);

/**
 * POST /api/main-point/complain/company/:id — file a complaint against a company.
 */
const complaintBodySchema = Joi.object({
  userId: objectId.optional(),
  message: Joi.string().trim().min(5).max(2000).required().messages({ 'string.min': 'message must be at least 5 characters' }),
});

router.post(
  '/complain/company/:id',
  authenticate,
  requireCustomer,
  validate(complaintBodySchema),
  asyncHandler(createCompanyComplaint)
);

/**
 * GET /api/main-point/installer/company/:id — installer team structure.
 */
router.get(
  '/installer/company/:id',
  authenticate,
  requireAdminOrCompany,
  asyncHandler(getInstallerCompany),
);

/**
 * GET /api/main-point/docs — interactive Swagger UI.
 *
 * The raw OpenAPI spec is also exposed as JSON at /docs/swagger.json. Per the
 * swagger-ui-express API, `serve` is an array of middlewares — hence the spread.
 */
router.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
router.use('/docs', ...serveDocsUI, serveDocsSetup);

export default router;