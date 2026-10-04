import { Router } from 'express';
import { estimateSolarProject } from '../controllers/estimator.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { solarEstimateInputSchema } from '../schemas/solarEstimate.schema.js';

const router = Router();

router.post('/estimate', validate(solarEstimateInputSchema), asyncHandler(estimateSolarProject));

export default router;
