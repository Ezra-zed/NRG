import { z } from 'zod';

/**
 * Centralised zod schemas used by the auth routes.
 */

// Supported actor roles.
export const ROLE_ENUM = ['seller-co', 'install-co', 'user'];

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
 * Branching: `seller-co` requires businessName + gstin, `install-co` requires
 * licenseNumber, `user` needs only basic details. These role-specific fields
 * are optional at the schema level and enforced with `.superRefine()` so all
 * other fields still get validated in one pass.
 */
export const signupSchema = z
  .object({
    role: z.enum(ROLE_ENUM, { error: 'role must be one of: seller-co, install-co, user' }),
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
    // No password for no-password accounts.
    if (data.role === 'user' && !data.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'password is required for role user with JWT-auth' });
    }
  });

/**
 * POST /api/auth/signin — single endpoint handling all three sign-in methods.
 * The `method` field routes to the right strategy handler.
 */
export const signinSchema = z
  .object({
    method: z.enum(METHOD_ENUM, { error: 'method must be one of: O-auth, JWT-auth, no-password' }),
    // JWT-auth credentials
    email: emailSchema.optional(),
    password: z.string().min(1, 'password is required').optional(),
    // no-password credentials
    phone: phoneSchema.optional(),
    otp: z.string().regex(/^[0-9]{4,8}$/, 'otp must be a 4-8 digit code').optional(),
    // O-auth credentials
    oauthProvider: z.enum(OAUTH_PROVIDERS, { error: 'unsupported oauth provider' }).optional(),
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