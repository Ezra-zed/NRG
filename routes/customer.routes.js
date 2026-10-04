import { Router } from 'express';
import Joi from 'joi';
import {
  getCustomerElectricityBill,
  listCustomers,
  registerCustomer,
} from '../controllers/customer.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { privateUpload } from '../utils/upload.js';
import asyncHandler from '../utils/asyncHandler.js';
import authenticate, { requireAdmin } from '../middlewares/auth.middleware.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';

/**
 * Customer routes.
 */

const router = Router();

// Multipart text fields are "" when absent — normalize empties to undefined.
const optStr = (schema) => schema.empty('').optional();

const registerSchema = Joi.object({
  name: optStr(Joi.string().trim().min(2).messages({ 'string.min': 'name must be at least 2 characters' })),
  mobile: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).required().messages({
    'string.pattern.base': 'mobile must be valid',
  }),
  email: optStr(Joi.string().trim().lowercase().email({ tlds: { allow: false } }).messages({ 'string.email': 'Invalid email address' })),
  location: optStr(Joi.string().trim().min(2)),
  pincode: optStr(Joi.string().trim().min(4)),
  propertyType: optStr(Joi.string().valid('residential', 'commercial', 'industrial', 'other')),
  monthlyBillAmount: Joi.number().min(0).empty('').optional(),
  requiredSystemSize: optStr(Joi.string().trim()),
});

/**
 * POST /api/customers/register — multipart/form-data.
 *   field   electricityBill  (file, optional) + the registerSchema fields above.
 */
router.post(
  '/register',
  rateLimit({ max: 10 }),
  privateUpload.single('electricityBill'),
  validate(registerSchema),
  asyncHandler(registerCustomer),
);

router.get('/:customerId/electricity-bill', authenticate, asyncHandler(getCustomerElectricityBill));

/**
 * GET /api/customers — reference listing (page, limit, q).
 */
router.get('/', authenticate, requireAdmin, asyncHandler(listCustomers));

export default router;