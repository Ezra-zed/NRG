import User from '../../models/User.model.js';
import AppError from '../../utils/AppError.js';
import { generateToken } from '../../utils/jwt.js';
import { sendSuccess } from '../../utils/apiResponse.js';

/**
 * Sign up a new user.
 *
 * @swagger
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account (seller company / installer company / end user)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, name, email, phone]
 *             properties:
 *               role: { type: string, enum: [customer, installer-company, solar-seller-company] }
 *               name: { type: string, description: 'Full name / company name' }
 *               email: { type: string, format: email }
 *               phone: { type: string, example: '+919876543210' }
 *               password: { type: string, minLength: 6, description: 'Required for JWT-auth flows (optional)' }
 *               businessName: { type: string, description: 'Required when role=solar-seller-company' }
 *               gstin: { type: string, description: 'Required when role=solar-seller-company' }
 *               licenseNumber: { type: string, description: 'Required when role=installer-company' }
 *     responses:
 *       '201':
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *                         token: { type: string }
 *       '400':
 *         description: Validation failed (missing/invalid fields)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       '409':
 *         description: Duplicate email or phone
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * @param {import('express').Request} req
 *   req.body — validated by zod:
 *   { role, name, email, phone, password?, businessName?, gstin?, licenseNumber? }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: { user, token }, message, error }
 */
export const signup = async (req, res) => {
  const {
    role,
    name,
    email,
    phone,
    password,
    businessName,
    gstin,
    licenseNumber,
  } = req.body;

  // The role-aware branch requirements were already enforced by the zod schema,
  // but a defensive duplicate check keeps direct helper misuse safe.
  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    const taken = existing.email === email ? 'email' : 'phone';
    throw new AppError(`This ${taken} is already registered. Please sign in instead.`, 409);
  }

  const user = await User.create({
    role,
    name,
    email,
    phone,
    password, // hashed by the User schema pre-save hook
    authProvider: password ? 'JWT-auth' : 'no-password',
    oauthId: undefined,
    businessName: role === 'seller-co' ? businessName : undefined,
    gstin: role === 'seller-co' ? gstin : undefined,
    licenseNumber: role === 'install-co' ? licenseNumber : undefined,
  });

  // Password is excluded by the model's toJSON transform.
  const token = generateToken({ id: user._id.toString(), role: user.role });

  sendSuccess(res, 201, { user, token }, `Account created as ${role}.`);
};