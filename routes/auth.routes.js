import { Router } from 'express';
import Joi from 'joi';
import { signup } from '../controllers/auth/signup.controller.js';
import { signin } from '../controllers/auth/signin.controller.js';
import { signupSchema, signinSchema } from '../controllers/auth/auth.schemas.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { refresh, logout } from '../controllers/auth/googleOAuth.controller.js';
import { exchangeNative, logoutNative, refreshNative } from '../controllers/auth/nativeAuth.controller.js';

/**
 * Auth routes — signup & the multi-method signin endpoint.
 *
 * Mounted at /api so the public endpoints are:
 *   POST /api/signup
 *   POST /api/signin
 *
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Sign up & sign in
 */

const router = Router();

/**
 * POST /api/signup — role-aware account creation.
 */
router.post('/signup', rateLimit({ max: 10 }), validate(signupSchema), asyncHandler(signup));

/**
 * POST /api/signin — single dispatch endpoint for the OAuth / JWT / no-password
 * strategy handlers (controllers/auth/strategies/*).
 */
router.post('/signin', rateLimit({ max: 20 }), validate(signinSchema), asyncHandler(signin));

router.post('/refresh', rateLimit({ max: 30 }), refresh);
router.post('/logout', logout);

// Additive native client contract. Existing browser cookie routes are unchanged.
const nativeRefreshSchema = Joi.object({ refreshToken: Joi.string().min(70).max(200).required() });
const nativeExchangeSchema = Joi.object({ code: Joi.string().min(32).max(200).required() });
router.post('/native/refresh', rateLimit({ max: 30 }), validate(nativeRefreshSchema), asyncHandler(refreshNative));
router.post('/native/exchange', rateLimit({ max: 20 }), validate(nativeExchangeSchema), asyncHandler(exchangeNative));
router.post('/native/logout', validate(nativeRefreshSchema), asyncHandler(logoutNative));

export default router;
