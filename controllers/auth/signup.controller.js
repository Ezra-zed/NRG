import User from '../../models/User.model.js';
import AppError from '../../utils/AppError.js';
import { createAuthSessionForClient } from '../../utils/authSession.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { publicUser } from '../../utils/publicUser.js';
import { isNativeClient } from '../../utils/nativeClient.js';

export const signupDuplicateError = (fields) => {
  const duplicateFields = new Set(fields);
  const hasEmail = duplicateFields.has('email');
  const hasPhone = duplicateFields.has('phone');

  if (hasEmail && hasPhone) {
    return new AppError(
      'This email address and phone number are already registered. Sign in to your existing account or use different contact details.',
      409,
      true,
      'SIGNUP_EMAIL_AND_PHONE_ALREADY_REGISTERED',
    );
  }
  if (hasEmail) {
    return new AppError(
      'This email address is already registered. Sign in to your existing account or use a different email address.',
      409,
      true,
      'SIGNUP_EMAIL_ALREADY_REGISTERED',
    );
  }
  if (hasPhone) {
    return new AppError(
      'This phone number is already registered. Sign in to your existing account or use a different phone number.',
      409,
      true,
      'SIGNUP_PHONE_ALREADY_REGISTERED',
    );
  }
  return null;
};

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
 *               businessName: { type: string, description: 'Required for company roles' }
 *               gstin: { type: string, description: 'Required for company roles' }
 *               licenseNumber: { type: string, description: 'Required for company roles' }
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
 *   req.body — validated by Joi:
 *   { role, name, email, phone, password?, businessName?, gstin?, licenseNumber? }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 201 { success, data: { user, token }, message, error }
 * The access token is short-lived; an HttpOnly refresh cookie is rotated at
 * POST /api/refresh.
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
    acceptPolicies,
  } = req.body;

  if (acceptPolicies !== true) throw new AppError('You must accept the Terms & Conditions and Privacy Policy to register.', 400, true, 'POLICY_CONSENT_REQUIRED');

  const [existingEmail, existingPhone] = await Promise.all([
    User.findOne({ email }),
    User.findOne({ phone }),
  ]);
  const duplicateError = signupDuplicateError([
    ...(existingEmail ? ['email'] : []),
    ...(existingPhone ? ['phone'] : []),
  ]);
  if (duplicateError) throw duplicateError;

  let user;
  try {
    user = await User.create({
      role,
      name,
      email,
      phone,
      password, // hashed by the User schema pre-save hook
      authProvider: password ? 'JWT-auth' : 'no-password',
      oauthId: undefined,
      businessName: role === 'user' ? undefined : businessName,
      gstin: role === 'user' ? undefined : gstin,
      licenseNumber: role === 'user' ? undefined : licenseNumber,
      policyConsent: { accepted: true, acceptedAt: new Date(), termsVersion: process.env.TERMS_VERSION || '1.0', privacyVersion: process.env.PRIVACY_VERSION || '1.0' },
    });
  } catch (error) {
    if (error?.code === 11000) {
      const fields = new Set([
        ...Object.keys(error.keyPattern || {}),
        ...Object.keys(error.keyValue || {}),
      ]);
      const duplicateError = signupDuplicateError(fields);
      if (duplicateError) throw duplicateError;
    }
    throw error;
  }

  // Password is excluded by the model's toJSON transform.
  const { token, refreshToken } = await createAuthSessionForClient(user, res, isNativeClient(req));

  sendSuccess(res, 201, { user: publicUser(user), token, ...(refreshToken ? { refreshToken } : {}) }, `Account created as ${role}.`);
};
