import { Router } from 'express';
import { z } from 'zod';
import { getHomeData } from '../controllers/home.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Home routes — solar solution type based product collections.
 *
 * @swagger
 * tags:
 *   - name: Home
 *     description: Solar solution types (on-grid / off-grid / hybrid-grid)
 */

const router = Router();

/**
 * GET /api/home?type=on-grid|off-grid|hybrid-grid
 */
const homeQuerySchema = z.object({
  type: z.enum(['on-grid', 'off-grid', 'hybrid-grid'], {
    error: "Query 'type' must be one of: on-grid, off-grid, hybrid-grid",
  }),
});

router.get('/', validate(homeQuerySchema, 'query'), asyncHandler(getHomeData));

export default router;