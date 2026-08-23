import { Router } from 'express';
import { z } from 'zod';
import { getMarketplace } from '../controllers/marketplace.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Marketplace routes — category filtered product catalogue.
 *
 * @swagger
 * tags:
 *   - name: Marketplace
 *     description: Product catalogue
 */

const router = Router();

/**
 * GET /api/marketplace
 * Query params: category, page, limit, minPrice, maxPrice, sortBy
 */
const marketplaceQuerySchema = z
  .object({
    category: z
      .enum(['solar-module', 'inverter', 'cable', 'structure', 'BOS'], {
        error: "category must be one of: solar-module, inverter, cable, structure, BOS",
      })
      .optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sortBy: z.enum(['price', 'newest'], { error: 'sortBy must be price or newest' }).optional(),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice cannot be greater than maxPrice',
    path: ['minPrice'],
  });

router.get('/', validate(marketplaceQuerySchema, 'query'), asyncHandler(getMarketplace));

export default router;