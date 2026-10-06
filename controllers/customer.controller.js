import mongoose from 'mongoose';
import Customer from '../models/Customer.model.js';
import { PRIVATE_UPLOAD_DIR, UPLOAD_DIR, privateFileName } from '../utils/upload.js';
import { sendSuccess } from '../utils/apiResponse.js';
import AppError from '../utils/AppError.js';

/**
 * POST /api/customers/register — register an end customer.
 *
 * The electricity bill is an uploaded file handled by the private uploader
 * middleware in the route (field name: `electricityBill`). All other fields
 * arrive as multipart text values (stored in req.body by multer).
 *
 * This public intake endpoint stores a customer inquiry only. It does not
 * authenticate a caller or create/link a login account from an unverified
 * phone number.
 *
 * @param {import('express').Request} req
 *   req.body —
 *   { name*, mobile*, email?, location?, pincode?, propertyType?, monthlyBillAmount?, requiredSystemSize? }
 *   req.file — uploaded electricity bill (optional).
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: { customer }, message, error }
 */
export const registerCustomer = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const {
    name,
    mobile,
    email,
    location,
    pincode,
    propertyType,
    monthlyBillAmount,
    requiredSystemSize,
    acceptPolicies,
  } = req.body;
  if (acceptPolicies !== true) throw new AppError('You must accept the Terms & Conditions and Privacy Policy to register.', 400, true, 'POLICY_CONSENT_REQUIRED');
  const file = req.file;

  const customer = new Customer({
    name: name || mobile,
    mobile,
    email: email || undefined,
    location: location || undefined,
    pincode: pincode || undefined,
    propertyType: propertyType || undefined,
    policyConsent: { accepted: true, acceptedAt: new Date(), termsVersion: process.env.TERMS_VERSION || '1.0', privacyVersion: process.env.PRIVACY_VERSION || '1.0' },
  });
  if (monthlyBillAmount !== undefined && monthlyBillAmount !== '') {
    customer.monthlyBillAmount = Number(monthlyBillAmount);
  }
  if (requiredSystemSize) customer.requiredSystemSize = requiredSystemSize;
  if (file) customer.electricityBill = privateFileName(file.filename);

  await customer.save();

  const customerData = customer.toJSON();
  if (customer.electricityBill) {
    customerData.electricityBill = `/api/customers/${customer._id}/electricity-bill`;
  }
  sendSuccess(res, 201, { customer: customerData }, 'Customer registered.');
};

/**
 * GET /api/customers — paginated customer listing for administrators.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { items, total }, message, error }
 */
export const listCustomers = async (req, res) => {
  res.set('Cache-Control', 'no-store');
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

  const safeItems = items.map((customer) => ({
    ...customer,
    electricityBill: customer.electricityBill
      ? `/api/customers/${customer._id}/electricity-bill`
      : undefined,
  }));

  sendSuccess(res, 200, { items: safeItems, total, page: currentPage, limit: pageSize }, 'Customers fetched.');
};

export const getCustomerElectricityBill = async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const { customerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new AppError('Invalid customerId.', 400);
  }

  const customer = await Customer.findById(customerId).select('userId electricityBill').lean();
  if (!customer) throw new AppError('Customer not found.', 404);

  const requesterId = String(req.user._id || req.user.id);
  if (req.user.role !== 'admin' && (
    req.user.role !== 'user'
    || !customer.userId
    || String(customer.userId) !== requesterId
  )) {
    throw new AppError('You are not allowed to access this electricity bill.', 403, true, 'FORBIDDEN');
  }
  if (!customer.electricityBill) throw new AppError('Electricity bill not found.', 404);

  const privateBill = /^[0-9]+-[a-f0-9]+\.(?:pdf|png|jpe?g|webp)$/.test(customer.electricityBill);
  const legacyBill = /^uploads\/[0-9]+-[a-f0-9]+\.(?:pdf|png|jpe?g|webp)$/.test(customer.electricityBill);
  if (!privateBill && !legacyBill) {
    throw new AppError('Stored electricity bill reference is invalid.', 500, false);
  }

  const root = privateBill ? PRIVATE_UPLOAD_DIR : UPLOAD_DIR;
  const fileName = privateBill ? customer.electricityBill : customer.electricityBill.slice('uploads/'.length);
  return res.sendFile(fileName, {
    root,
    headers: {
      'Content-Disposition': 'attachment',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  }, (error) => {
    if (error) next(error);
  });
};
