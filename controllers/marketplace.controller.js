import Product from '../models/Product.model.js';
import AppError from '../utils/AppError.js';
import { sendSuccess, paginate } from '../utils/apiResponse.js';

/**
 * Marketplace listing — category filtered, paginated, priced & sorted.
 *
 * @swagger
 * /marketplace:
 *   get:
 *     tags: [Marketplace]
 *     summary: List products with filters, pagination & sorting
 *     description: Filter by category/price, paginate, sort by price or newest.
 *     parameters:
 *       - in: query
 *         name: category
 *         required: true
 *         schema: { type: string, enum: [solar-module, inverter, cable, structure, BOS] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, description: 'Default: 1' }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, description: 'Default: 10' }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number, minimum: 0 }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number, minimum: 0 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [price, newest], description: 'Default: newest' }
 *     responses:
 *       '200':
 *         description: Paginated product list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items: { type: array, items: { $ref: '#/components/schemas/Product' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *                 message: { type: string }
 *                 error: { type: object, nullable: true }
 *       '400':
 *         description: Invalid category / filters
 *
 * @param {import('express').Request} req
 *   req.query — { category?, page?, limit?, minPrice?, maxPrice?, sortBy? }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { items, pagination }, message, error }
 */
export const getMarketplace = async (req, res) => {
  const {
    category,
    page = 1,
    limit = 10,
    minPrice,
    maxPrice,
    sortBy = 'newest',
  } = req.query;

  const CATEGORIES = ['solar-module', 'inverter', 'cable', 'structure', 'BOS'];

  if (category && !CATEGORIES.includes(category)) {
    throw new AppError(
      `Invalid category '${category}'. Use one of: ${CATEGORIES.join(', ')}.`,
      400
    );
  }

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  if (minPrice !== undefined && minPrice !== '' && Number(minPrice) < 0) {
    throw new AppError('minPrice cannot be negative.', 400);
  }
  if (maxPrice !== undefined && maxPrice !== '' && Number(maxPrice) < 0) {
    throw new AppError('maxPrice cannot be negative.', 400);
  }

  // Build the filter chain.
  const filter = {};
  if (category) filter.category = category;
  if (minPrice !== undefined && minPrice !== '') filter.price = { ...(filter.price || {}), $gte: Number(minPrice) };
  if (maxPrice !== undefined && maxPrice !== '') filter.price = { ...(filter.price || {}), $lte: Number(maxPrice) };

  const sort = sortBy === 'price' ? { price: 1 } : { createdAt: -1 };

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Product.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    200,
    paginate(items, total, currentPage, pageSize),
    `Marketplace — ${category || 'all categories'}.`
  );
};