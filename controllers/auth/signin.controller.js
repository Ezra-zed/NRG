import { sendSuccess } from '../../utils/apiResponse.js';
import { handleOAuthSignin } from './strategies/handleOAuthSignin.js';
import { handleJwtSignin } from './strategies/handleJwtSignin.js';
import { handleNoPasswordSignin } from './strategies/handleNoPasswordSignin.js';

/**
 * Single sign-in endpoint that handles all three authentication methods.
 *
 * The strategy switch lives here & each strategy lives in its own file under
 * controllers/auth/strategies/. All three converge on the same response shape:
 *   { success: true, data: { user, token }, message }
 *
 * @swagger
 * /auth/signin:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in & receive a JWT (OAuth / email+password / OTP)
 *     description: Single endpoint dispatching to the OAuth, JWT or no-password strategies.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [method]
 *             properties:
 *               method: { type: string, enum: [O-auth, JWT-auth, no-password] }
 *               email: { type: string, format: email, description: 'JWT-auth / no-password' }
 *               password: { type: string, format: password, description: 'JWT-auth' }
 *               phone: { type: string, description: 'no-password' }
 *               otp: { type: string, description: 'no-password (already delivered/verified)' }
 *               oauthProvider: { type: string, enum: [google], description: 'O-auth' }
 *               oauthToken: { type: string, description: 'O-auth' }
 *     responses:
 *       '200':
 *         description: Signed in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *                     token: { type: string }
 *                 message: { type: string }
 *                 error: { type: object, nullable: true }
 *       '400':
 *         description: Validation failed
 *       '401':
 *         description: Invalid credentials
 *
 * @param {import('express').Request} req
 *   req.body — validated by zod: { method, email?, password?, phone?, otp?, oauthProvider?, oauthToken? }
 * @param {import('express').Response} res
 * @returns {Promise<void>} 200 { success, data: { user, token }, message, error }
 */
export const signin = async (req, res) => {
  const { method } = req.body;

  const strategies = {
    'O-auth': handleOAuthSignin,
    'JWT-auth': handleJwtSignin,
    'no-password': handleNoPasswordSignin,
  };

  const handler = strategies[method];
  const { user, token, message } = await handler(req.body);

  sendSuccess(res, 200, { user, token }, message);
};