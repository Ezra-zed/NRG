import { Router } from 'express';
import Joi from 'joi';
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
const marketplaceQuerySchema = Joi.object({
    category: Joi.string().valid('solar-module', 'inverter', 'cable', 'structure', 'BOS').optional(),
    page: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().positive().max(100).optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    sortBy: Joi.string().valid('price', 'newest').optional(),
  }).custom((query, helpers) => {
    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      return helpers.error('any.custom');
    }
    return query;
  }).messages({ 'any.custom': 'minPrice cannot be greater than maxPrice' });

router.get('/', validate(marketplaceQuerySchema, 'query'), asyncHandler(getMarketplace));

export default router;