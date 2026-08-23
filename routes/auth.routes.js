import { Router } from 'express';
import { signup } from '../controllers/auth/signup.controller.js';
import { signin } from '../controllers/auth/signin.controller.js';
import { signupSchema, signinSchema } from '../controllers/auth/auth.schemas.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

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
router.post('/signup', validate(signupSchema), asyncHandler(signup));

/**
 * POST /api/signin — single dispatch endpoint for the OAuth / JWT / no-password
 * strategy handlers (controllers/auth/strategies/*).
 */
router.post('/signin', validate(signinSchema), asyncHandler(signin));

export default router;