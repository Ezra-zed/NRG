import { z } from 'zod';

/**
 * Centralised zod schemas used by the auth routes.
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

const roleSchema = z.preprocess(
  (value) => (typeof value === 'string' ? ROLE_ALIASES[value.trim()] : value),
  z.enum(['user', 'install-co', 'seller-co'], {
    message: 'role must be customer, installer-company, or solar-seller-company',
  })
);

// Supported authentication methods.
export const METHOD_ENUM = ['O-auth', 'JWT-auth', 'no-password'];

const emailSchema = z.string().trim().toLowerCase().email('Invalid email address');
const phoneSchema = z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number');
const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);

// OAuth provider identifiers accepted by the (stubbed) provider verification.
const OAUTH_PROVIDERS = ['google'];

/**
 * POST /api/signup — role-aware signup schema.
 *
 * Branching: solar seller companies require businessName + gstin, installer
 * companies require licenseNumber, and customers need only basic details.
 * These role-specific fields
 * are optional at the schema level and enforced with `.superRefine()` so all
 * other fields still get validated in one pass.
 */
export const signupSchema = z
  .object({
    role: roleSchema,
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    // role-specific
    businessName: z.string().trim().min(2, 'businessName is required for seller-co').optional(),
    gstin: z.string().trim().toUpperCase().optional(),
    licenseNumber: z.string().trim().min(2, 'licenseNumber is required for install-co').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'seller-co') {
      if (!data.businessName) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessName'], message: 'businessName is required for role seller-co' });
      }
      if (!data.gstin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gstin'], message: 'gstin is required for role seller-co' });
      }
    }
    if (data.role === 'install-co') {
      if (!data.licenseNumber) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['licenseNumber'], message: 'licenseNumber is required for role install-co' });
      }
    }
  });

/**
 * POST /api/auth/signin — single endpoint handling all three sign-in methods.
 * The `method` field routes to the right strategy handler.
 */
export const signinSchema = z
  .object({
    method: z.enum(METHOD_ENUM, { message: 'method must be one of: O-auth, JWT-auth, no-password' }),
    // JWT-auth credentials
    email: emailSchema.optional(),
    password: z.string().min(1, 'password is required').optional(),
    // no-password credentials
    phone: phoneSchema.optional(),
    otp: z.string().regex(/^[0-9]{4,8}$/, 'otp must be a 4-8 digit code').optional(),
    // O-auth credentials
    oauthProvider: z.enum(OAUTH_PROVIDERS, { message: 'unsupported oauth provider' }).optional(),
    oauthToken: z.string().min(1, 'oauthToken is required').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'JWT-auth') {
      if (!data.email || !data.password) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['credentials'], message: 'JWT-auth requires email and password' });
      }
    }
    if (data.method === 'no-password') {
      if (!data.email && !data.phone) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identifier'], message: 'no-password requires either email or phone' });
      }
      if (!data.otp) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['otp'], message: 'no-password requires otp' });
      }
    }
    if (data.method === 'O-auth') {
      if (!data.oauthProvider || !data.oauthToken) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['oauth'], message: 'O-auth requires oauthProvider and oauthToken' });
      }
    }
  });