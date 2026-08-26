import User from '../models/User.model.js';
import Customer from '../models/Customer.model.js';
import { generateToken } from '../utils/jwt.js';
import { publicFileUrl } from '../utils/upload.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * POST /api/customers/register — register an end customer.
 *
 * The electricity bill is an uploaded file handled by the `upload.single`
 * middleware in the route (field name: `electricityBill`). All other fields
 * arrive as multipart text values (stored in req.body by multer).
 *
 * A matching auth User is found-or-created on `mobile` so the frontend receives
 * a reusable JWT token for subsequent authenticated calls.
 *
 * @param {import('express').Request} req
 *   req.body —
 *   { name*, mobile*, email?, location?, pincode?, propertyType?, monthlyBillAmount?, requiredSystemSize? }
 *   req.file — uploaded electricity bill (optional).
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: { customer, user, token }, message, error }
 */
export const registerCustomer = async (req, res) => {
  const {
    name,
    mobile,
    email,
    location,
    pincode,
    propertyType,
    monthlyBillAmount,
    requiredSystemSize,
  } = req.body;
  const file = req.file;

  // Find or create the auth user keyed by mobile (primary identifier).
  let user = await User.findOne({ phone: mobile });
  const userCreated = !user;
  if (!user) {
    user = await User.create({
      role: 'user',
      name: name || mobile,
      phone: mobile,
      email: email || undefined,
      authProvider: 'no-password',
    });
  }

  let customer = await Customer.findOne({ mobile });
  if (!customer) customer = new Customer({ userId: user._id, mobile });

  customer.name = name || customer.name || user.name;
  customer.email = email || customer.email || undefined;
  customer.location = location || undefined;
  customer.pincode = pincode || undefined;
  if (propertyType) customer.propertyType = propertyType;
  if (monthlyBillAmount !== undefined && monthlyBillAmount !== '') {
    customer.monthlyBillAmount = Number(monthlyBillAmount);
  }
  if (requiredSystemSize) customer.requiredSystemSize = requiredSystemSize;
  if (file) customer.electricityBill = publicFileUrl(file.filename);

  await customer.save();

  const token = generateToken({ id: user._id.toString(), role: user.role });

  sendSuccess(
    res,
    201,
    { customer, user, token, userCreated },
    userCreated ? 'Customer registered & account created.' : 'Customer registered.'
  );
};

/**
 * GET /api/customers — optional lightweight listing for reference/dashboards.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { items, total }, message, error }
 */
export const listCustomers = async (req, res) => {
  const { page = 1, limit = 10, q } = req.query;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

  const filter = {};
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { mobile: rx }, { email: rx }, { pincode: rx }];
  }

  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).lean(),
    Customer.countDocuments(filter),
  ]);

  sendSuccess(res, 200, { items, total, page: currentPage, limit: pageSize }, 'Customers fetched.');
};