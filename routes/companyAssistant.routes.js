import { Router } from 'express';
import Joi from 'joi';
import authenticate from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { companyAssistant } from '../controllers/companyAssistant.controller.js';
import { companyAssistantRateLimit } from '../middlewares/companyAssistantRateLimit.middleware.js';

const router = Router();

export const assistantSchema = Joi.object({
  message: Joi.string().trim().min(1).max(1000).required(),
  conversationId: Joi.string().trim().min(1).max(100).optional(),
});

/**
 * @swagger
 * /company/assistant:
 *   post:
 *     tags: [Company]
 *     summary: Ask the authenticated company operations assistant
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, maxLength: 1000, example: What should I do next? }
 *               conversationId: { type: string, example: conversation-123 }
 *     responses:
 *       200: { description: Assistant response generated }
 *       400: { description: Invalid message }
 *       401: { description: Unauthenticated }
 *       403: { description: Non-company user }
 *       429: { description: Rate limit or provider rate limit }
 *       500: { description: Assistant failure }
 */
router.post(
  '/assistant',
  authenticate,
  companyAssistantRateLimit,
  validate(assistantSchema),
  asyncHandler(companyAssistant)
);

export default router;