import { Router } from 'express';
import { z } from 'zod';
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
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24-char ObjectId');

/**
 * GET /api/main-point/complain/listing — paginated complaints.
 */
const listingQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(['open', 'in-progress', 'resolved', 'closed']).optional(),
  });

router.get(
  '/complain/listing',
  validate(listingQuerySchema, 'query'),
  asyncHandler(listComplaints)
);

/**
 * POST /api/main-point/complain/call-log — record a follow-up call.
 */
const callLogBodySchema = z.object({
  complaintId: objectId,
  notes: z.string().trim().min(1, 'notes cannot be empty').max(2000),
  calledBy: z.string().trim().min(1, 'calledBy cannot be empty').max(100),
});

router.post(
  '/complain/call-log',
  validate(callLogBodySchema),
  asyncHandler(createCallLog)
);

/**
 * POST /api/main-point/complain/company/:id — file a complaint against a company.
 */
const complaintBodySchema = z.object({
  userId: objectId,
  message: z.string().trim().min(5, 'message must be at least 5 characters').max(2000),
});

router.post(
  '/complain/company/:id',
  validate(complaintBodySchema),
  asyncHandler(createCompanyComplaint)
);

/**
 * GET /api/main-point/installer/company/:id — installer team structure.
 */
router.get('/installer/company/:id', asyncHandler(getInstallerCompany));

/**
 * GET /api/main-point/docs — interactive Swagger UI.
 *
 * The raw OpenAPI spec is also exposed as JSON at /docs/swagger.json. Per the
 * swagger-ui-express API, `serve` is an array of middlewares — hence the spread.
 */
router.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
router.use('/docs', ...serveDocsUI, serveDocsSetup);

export default router;