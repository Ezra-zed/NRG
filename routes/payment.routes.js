import { Router } from 'express';
import Joi from 'joi';
import authenticate, { requireCustomer } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { cancelPayment, createPaymentOrder, getPaymentStatus, razorpayWebhook, verifyPayment } from '../controllers/payment.controller.js';

const router = Router();
const id = Joi.string().pattern(/^[a-f\d]{24}$/i).required();
const createSchema = Joi.object({ projectId: id, quoteId: id });
const verifySchema = Joi.object({
  paymentId: id,
  orderId: Joi.string().pattern(/^order_[A-Za-z0-9]+$/).required(),
  razorpayPaymentId: Joi.string().pattern(/^pay_[A-Za-z0-9]+$/).required(),
  razorpaySignature: Joi.string().hex().length(64).required(),
});

router.post('/webhook', asyncHandler(razorpayWebhook));
router.post('/orders', authenticate, requireCustomer, rateLimit({ max: 10 }), validate(createSchema), asyncHandler(createPaymentOrder));
router.post('/verify', authenticate, requireCustomer, rateLimit({ max: 20 }), validate(verifySchema), asyncHandler(verifyPayment));
router.post('/cancel', authenticate, requireCustomer, validate(Joi.object({ paymentId: id })), asyncHandler(cancelPayment));
router.get('/:paymentId', authenticate, requireCustomer, validate(Joi.object({ paymentId: id }), 'params'), asyncHandler(getPaymentStatus));

export default router;
