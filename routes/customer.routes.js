import { Router } from 'express';
import Joi from 'joi';
import { registerCustomer, listCustomers } from '../controllers/customer.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { upload } from '../utils/upload.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Customer routes.
 */

const router = Router();

// Multipart text fields are "" when absent — normalize empties to undefined.
const optStr = (schema) => schema.empty('').optional();

const registerSchema = Joi.object({
  name: optStr(Joi.string().trim().min(2).messages({ 'string.min': 'name must be at least 2 characters' })),
  mobile: Joi.string().trim().min(7).max(15).required().messages({ 'string.min': 'mobile must be valid' }),
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
router.post('/register', upload.single('electricityBill'), validate(registerSchema), asyncHandler(registerCustomer));

/**
 * GET /api/customers — reference listing (page, limit, q).
 */
router.get('/', asyncHandler(listCustomers));

export default router;