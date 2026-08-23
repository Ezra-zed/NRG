import Product from '../models/Product.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * Home — product collections for a given solar solution type.
 *
 * @swagger
 * /home:
 *   get:
 *     tags: [Home]
 *     summary: Products & highlights for a solar solution type
 *     description: Reads `type` from the query string and returns curated products.
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [on-grid, off-grid, hybrid-grid] }
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     type: { type: string }
 *                     products: { type: array, items: { $ref: '#/components/schemas/Product' } }
 *                     count: { type: integer }
 *                 message: { type: string }
 *                 error: { type: object, nullable: true }
 *       '400':
 *         description: Invalid or missing type
 *
 * @param {import('express').Request} req
 *   req.query.type — one of ['on-grid', 'off-grid', 'hybrid-grid'] (validated
 *   by the route middleware before this controller runs).
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { type, products, count }, message, error }
 */
export const getHomeData = async (req, res) => {
  const { type } = req.query;

  if (!type) {
    throw new AppError("Query parameter 'type' is required.", 400);
  }
  if (!['on-grid', 'off-grid', 'hybrid-grid'].includes(type)) {
    throw new AppError("Invalid 'type'. Use one of: on-grid | off-grid | hybrid-grid.", 400);
  }

  // A solution type maps to the product categories it needs. When the mapping
  // is empty every category is eligible — use the query as a soft filter.
  const TYPE_CATEGORIES = {
    'on-grid': ['solar-module', 'inverter'],
    'off-grid': ['solar-module', 'inverter', 'structure'],
    'hybrid-grid': ['solar-module', 'inverter', 'cable', 'structure', 'BOS'],
  };

  const query = { category: { $in: TYPE_CATEGORIES[type] } };
  const products = await Product.find(query).sort({ createdAt: -1 }).lean();

  sendSuccess(res, 200, { type, products, count: products.length }, `Home data for ${type}.`);
};