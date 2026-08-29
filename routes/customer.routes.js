import { Router } from 'express';
import { z } from 'zod';
import { registerCustomer, listCustomers } from '../controllers/customer.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { upload } from '../utils/upload.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Customer routes.
 */

const router = Router();

// Multipart text fields are "" when absent — normalize empties to undefined.
const optStr = (schema) =>
  z
    .union([z.literal(''), schema])
    .transform((v) => (v === '' ? undefined : v));

const registerSchema = z.object({
  name: optStr(z.string().trim().min(2, 'name must be at least 2 characters')).optional(),
  mobile: z.string().trim().min(7, 'mobile must be valid').max(15),
  email: optStr(z.string().trim().toLowerCase().email('Invalid email address')).optional(),
  location: optStr(z.string().trim().min(2)).optional(),
  pincode: optStr(z.string().trim().min(4)).optional(),
  propertyType: optStr(z.enum(['residential', 'commercial', 'industrial', 'other'])).optional(),
  monthlyBillAmount: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
    z.number().min(0).optional()
  ),
  requiredSystemSize: optStr(z.string().trim()).optional(),
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