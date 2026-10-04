import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import Payment from '../models/Payment.model.js';
import Project from '../models/Project.model.js';
import {
  amountToPaise, createRazorpayOrder, fetchRazorpayPayment,
  getRazorpayConfig, verifyCheckoutSignature, verifyWebhookSignature,
} from '../services/payment.service.js';

const userIdOf = (req) => req.user?._id || req.user?.id;
const asPayment = (payment) => ({
  id: payment._id.toString(), amount: payment.amount, currency: payment.currency,
  status: payment.status, razorpayOrderId: payment.razorpayOrderId,
  razorpayPaymentId: payment.razorpayPaymentId, projectId: payment.projectId.toString(),
  quoteId: payment.quoteId.toString(), createdAt: payment.createdAt, updatedAt: payment.updatedAt,
});

export async function createPaymentOrder(req, res) {
  const { projectId, quoteId } = req.body;
  const userId = userIdOf(req);
  const idempotencyKey = req.get('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new AppError('Provide an Idempotency-Key header (1 to 128 characters).', 400, true, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(quoteId)) {
    throw new AppError('A valid projectId and quoteId are required.', 400, true, 'INVALID_PAYMENT_REFERENCE');
  }

  const existing = await Payment.findOne({ userId, idempotencyKey });
  if (existing) {
    if (existing.projectId.toString() !== projectId || existing.quoteId.toString() !== quoteId) {
      throw new AppError('This Idempotency-Key was already used for another payment.', 409, true, 'IDEMPOTENCY_KEY_REUSED');
    }
    if (existing.razorpayOrderId) {
      const { keyId } = getRazorpayConfig();
      return sendSuccess(res, 200, { payment: asPayment(existing), checkout: { keyId, orderId: existing.razorpayOrderId } }, 'Existing payment order returned.');
    }
    throw new AppError('Payment order creation is already being processed. Retry shortly with the same key.', 409, true, 'PAYMENT_CREATION_IN_PROGRESS');
  }

  const project = await Project.findOne({ _id: projectId, userId, trackingStatus: 'quote-approved' }).select('quotes trackingStatus').lean();
  const quote = project?.quotes?.find((item) => item._id.toString() === quoteId && item.status === 'accepted');
  if (!quote) throw new AppError('An approved quote for your project is required to start payment.', 409, true, 'APPROVED_QUOTE_REQUIRED');
  const amount = amountToPaise(quote.estimatedPrice);
  const { keyId } = getRazorpayConfig();

  let payment;
  try {
    payment = await Payment.create({ userId, projectId, quoteId, amount, currency: 'INR', idempotencyKey, status: 'creating' });
  } catch (error) {
    if (error.code === 11000) {
      const raced = await Payment.findOne({ userId, idempotencyKey });
      if (raced?.razorpayOrderId) {
        const { keyId } = getRazorpayConfig();
        return sendSuccess(res, 200, { payment: asPayment(raced), checkout: { keyId, orderId: raced.razorpayOrderId } }, 'Existing payment order returned.');
      }
    }
    throw error;
  }

  try {
    const order = await createRazorpayOrder({
      amount, currency: 'INR', receipt: `enrg_${payment._id.toString()}`,
      notes: { paymentId: payment._id.toString(), projectId, quoteId, userId: userId.toString() },
    });
    payment.razorpayOrderId = order.id;
    payment.status = 'created';
    await payment.save();
    return sendSuccess(res, 201, { payment: asPayment(payment), checkout: { keyId, orderId: order.id, amount: order.amount, currency: order.currency } }, 'Payment order created.');
  } catch (error) {
    // Network/provider outages can happen after Razorpay created the order but
    // before this server received its response. Keep the quote locked and the
    // idempotency record intact so retry cannot mint a second gateway order.
    if (error.statusCode !== 503 && error.statusCode !== 502) {
      payment.status = 'creation_failed';
      payment.active = false;
      await payment.save().catch(() => {});
    }
    throw error;
  }
}

export async function verifyPayment(req, res) {
  const userId = userIdOf(req);
  const { paymentId, orderId, razorpayPaymentId, razorpaySignature } = req.body;
  const payment = await Payment.findOne({ _id: paymentId, userId });
  if (!payment) throw new AppError('Payment not found.', 404, true, 'PAYMENT_NOT_FOUND');
  if (payment.status === 'paid') return sendSuccess(res, 200, { payment: asPayment(payment) }, 'Payment already verified.');
  if (payment.razorpayOrderId !== orderId) throw new AppError('Payment order does not match.', 400, true, 'ORDER_MISMATCH');
  if (!verifyCheckoutSignature({ orderId, paymentId: razorpayPaymentId, signature: razorpaySignature })) {
    throw new AppError('Payment signature is invalid.', 400, true, 'INVALID_PAYMENT_SIGNATURE');
  }

  const gatewayPayment = await fetchRazorpayPayment(razorpayPaymentId);
  if (gatewayPayment.order_id !== payment.razorpayOrderId || gatewayPayment.amount !== payment.amount || gatewayPayment.currency !== payment.currency) {
    throw new AppError('Payment details do not match the expected order.', 409, true, 'PAYMENT_DETAILS_MISMATCH');
  }
  if (gatewayPayment.status === 'captured') {
    payment.status = 'paid'; payment.active = false; payment.razorpayPaymentId = gatewayPayment.id; payment.paidAt = new Date();
    try { await payment.save(); } catch (error) {
      if (error.code === 11000) throw new AppError('This project quote has already been paid.', 409, true, 'DUPLICATE_SUCCESSFUL_PAYMENT');
      throw error;
    }
  } else if (gatewayPayment.status === 'authorized') {
    payment.status = 'authorized'; payment.razorpayPaymentId = gatewayPayment.id; await payment.save();
  } else if (gatewayPayment.status === 'failed') {
    // A failed attempt does not necessarily close its Razorpay order; the
    // customer can retry against the same order, so keep the quote locked.
    payment.status = 'failed'; payment.razorpayPaymentId = gatewayPayment.id; await payment.save();
  } else {
    payment.status = 'pending'; await payment.save();
  }
  return sendSuccess(res, 200, { payment: asPayment(payment) }, payment.status === 'paid' ? 'Payment verified.' : 'Payment status synchronized with the provider.');
}

export async function getPaymentStatus(req, res) {
  const payment = await Payment.findOne({ _id: req.params.paymentId, userId: userIdOf(req) });
  if (!payment) throw new AppError('Payment not found.', 404, true, 'PAYMENT_NOT_FOUND');
  if (['created', 'pending', 'authorized'].includes(payment.status)
      && payment.updatedAt < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
    payment.status = 'interrupted';
    await payment.save();
  }
  return sendSuccess(res, 200, { payment: asPayment(payment) }, 'Payment status fetched.');
}

// Checkout dismissal is an informational client signal only. A later signed
// webhook can still move this record to paid if Razorpay confirms settlement.
export async function cancelPayment(req, res) {
  const payment = await Payment.findOne({ _id: req.body.paymentId, userId: userIdOf(req) });
  if (!payment) throw new AppError('Payment not found.', 404, true, 'PAYMENT_NOT_FOUND');
  if (['created', 'pending'].includes(payment.status)) {
    payment.status = 'cancelled';
    // Keep the quote locked: dismissing the UI does not prove the gateway order
    // cannot still settle. A provider failure or capture webhook ends the lock.
    await payment.save();
  }
  return sendSuccess(res, 200, { payment: asPayment(payment) }, 'Checkout cancellation recorded.');
}

export async function razorpayWebhook(req, res) {
  const signature = req.get('x-razorpay-signature');
  if (!verifyWebhookSignature(req.body, signature)) throw new AppError('Webhook signature is invalid.', 400, true, 'INVALID_WEBHOOK_SIGNATURE');
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { throw new AppError('Webhook payload is invalid.', 400, true, 'INVALID_WEBHOOK_PAYLOAD'); }
  const eventType = event.event;
  const gatewayPayment = event.payload?.payment?.entity;
  const gatewayOrder = event.payload?.order?.entity;
  const orderId = gatewayPayment?.order_id || gatewayOrder?.id;
  if (!orderId) return sendSuccess(res, 200, { received: true, ignored: true }, 'Webhook received.');

  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment) return sendSuccess(res, 200, { received: true, ignored: true }, 'Webhook received.');
  payment.lastWebhookAt = new Date();
  if (['payment.captured', 'order.paid'].includes(eventType)) {
    const amount = gatewayPayment?.amount ?? gatewayOrder?.amount_paid;
    const currency = gatewayPayment?.currency ?? gatewayOrder?.currency;
    if (amount !== payment.amount || currency !== payment.currency) throw new AppError('Webhook payment details do not match the expected order.', 409, true, 'PAYMENT_DETAILS_MISMATCH');
    payment.status = 'paid';
    payment.active = false;
    payment.razorpayPaymentId = gatewayPayment?.id || payment.razorpayPaymentId;
    payment.paidAt = payment.paidAt || new Date();
  } else if (eventType === 'payment.failed' && payment.status !== 'paid') {
    payment.status = 'failed';
    payment.razorpayPaymentId = gatewayPayment?.id || payment.razorpayPaymentId;
    payment.failureCode = gatewayPayment?.error_code || null;
    payment.failureReason = gatewayPayment?.error_description || null;
  }
  try { await payment.save(); } catch (error) {
    if (error.code === 11000) throw new AppError('This project quote has already been paid.', 409, true, 'DUPLICATE_SUCCESSFUL_PAYMENT');
    throw error;
  }
  return sendSuccess(res, 200, { received: true }, 'Webhook processed.');
}
