import Joi from 'joi';

/**
 * Centralized Joi schemas used by the auth routes.
 */

// Public signup role names are normalized to the existing database role values.
export const ROLE_ENUM = ['customer', 'installer-company', 'solar-seller-company'];
const ROLE_ALIASES = {
  customer: 'user',
  'installer-company': 'install-co',
  'solar-seller-company': 'seller-co',
  user: 'user',
  'install-co': 'install-co',
  'seller-co': 'seller-co',
};

const roleSchema = Joi.string().trim().custom((value, helpers) => {
  const normalizedRole = ROLE_ALIASES[value];
  if (!normalizedRole) {
    return helpers.error('any.only');
  }
  return normalizedRole;
}).messages({
  'any.only': 'role must be customer, installer-company, or solar-seller-company',
});

// Supported authentication methods.
export const METHOD_ENUM = ['O-auth', 'JWT-auth', 'no-password'];

const emailSchema = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).messages({ 'string.email': 'Invalid email address' });
const phoneSchema = Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).messages({ 'string.pattern.base': 'Invalid phone number' });
const nameSchema = Joi.string().trim().min(2).max(100).messages({ 'string.min': 'Name must be at least 2 characters' });

// OAuth provider identifiers accepted by the (stubbed) provider verification.
const OAUTH_PROVIDERS = ['google'];

/**
 * POST /api/signup — role-aware signup schema.
 *
 * Branching: solar seller companies require businessName + gstin, installer
 * companies require licenseNumber, and customers need only basic details.
 * These role-specific fields are enforced with Joi conditionals so all other
 * fields still get validated in one pass.
 */
export const signupSchema = Joi.object({
    role: roleSchema.required(),
    name: nameSchema.required(),
    email: emailSchema.required(),
    phone: phoneSchema.required(),
    password: Joi.string().min(6).optional().messages({ 'string.min': 'Password must be at least 6 characters' }),
    // role-specific
    businessName: Joi.string().trim().min(2).optional().messages({ 'string.min': 'businessName must be at least 2 characters' })
      .when('role', { is: 'seller-co', then: Joi.required().messages({ 'any.required': 'businessName is required for solar-seller-company' }) }),
    gstin: Joi.string().trim().uppercase().optional()
      .when('role', { is: 'seller-co', then: Joi.required().messages({ 'any.required': 'gstin is required for solar-seller-company verification' }) }),
    licenseNumber: Joi.string().trim().min(2).optional().messages({ 'string.min': 'licenseNumber must be at least 2 characters' })
      .when('role', { is: 'install-co', then: Joi.required().messages({ 'any.required': 'licenseNumber is required for installer-company verification' }) }),
  });

/**
 * POST /api/auth/signin — single endpoint handling all three sign-in methods.
 * The `method` field routes to the right strategy handler.
 */
export const signinSchema = Joi.object({
    method: Joi.string().valid(...METHOD_ENUM).required().messages({ 'any.only': 'method must be one of: O-auth, JWT-auth, no-password' }),
    // JWT-auth credentials
    email: emailSchema.optional().when('method', { is: 'JWT-auth', then: Joi.required().messages({ 'any.required': 'JWT-auth requires email and password' }) }),
    password: Joi.string().min(1).optional().messages({ 'string.min': 'password is required' })
      .when('method', { is: 'JWT-auth', then: Joi.required().messages({ 'any.required': 'JWT-auth requires email and password' }) }),
    // no-password credentials
    phone: phoneSchema.optional(),
    otp: Joi.string().pattern(/^[0-9]{4,8}$/).optional().messages({ 'string.pattern.base': 'otp must be a 4-8 digit code' })
      .when('method', { is: 'no-password', then: Joi.required().messages({ 'any.required': 'no-password requires otp' }) }),
    // O-auth credentials
    oauthProvider: Joi.string().valid(...OAUTH_PROVIDERS).optional().messages({ 'any.only': 'unsupported oauth provider' })
      .when('method', { is: 'O-auth', then: Joi.required().messages({ 'any.required': 'O-auth requires oauthProvider and oauthToken' }) }),
    oauthToken: Joi.string().min(1).optional().messages({ 'string.min': 'oauthToken is required' })
      .when('method', { is: 'O-auth', then: Joi.required().messages({ 'any.required': 'O-auth requires oauthProvider and oauthToken' }) }),
  }).custom((data, helpers) => {
    if (data.method === 'no-password' && !data.email && !data.phone) {
      return helpers.error('any.custom');
    }
    return data;
  }).messages({
    'any.custom': 'no-password requires either email or phone',
  });