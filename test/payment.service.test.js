import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { amountToPaise, verifyCheckoutSignature, verifyWebhookSignature } from '../services/payment.service.js';

test('converts quote rupees to safe integer paise', () => {
  assert.equal(amountToPaise(1250), 125000);
  assert.equal(amountToPaise(12.34), 1234);
  assert.throws(() => amountToPaise(0), { errorCode: 'INVALID_QUOTE_AMOUNT' });
  assert.throws(() => amountToPaise(Number.MAX_SAFE_INTEGER), { errorCode: 'INVALID_QUOTE_AMOUNT' });
});

test('validates Razorpay checkout signatures using the configured key secret', () => {
  const previousId = process.env.RAZORPAY_KEY_ID;
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_unit';
  process.env.RAZORPAY_KEY_SECRET = 'unit-test-secret';
  try {
    const orderId = 'order_test123';
    const paymentId = 'pay_test123';
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`).digest('hex');
    assert.equal(verifyCheckoutSignature({ orderId, paymentId, signature }), true);
    assert.equal(verifyCheckoutSignature({ orderId, paymentId, signature: '0'.repeat(64) }), false);
    assert.equal(verifyCheckoutSignature({ orderId, paymentId: '', signature }), false);
  } finally {
    if (previousId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousId;
    if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousSecret;
  }
});

test('validates webhook signatures against exact raw bytes', () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-unit-secret';
  try {
    const payload = Buffer.from('{"event":"payment.captured"}');
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
    assert.equal(verifyWebhookSignature(payload, signature), true);
    assert.equal(verifyWebhookSignature(Buffer.from(`${payload.toString()} `), signature), false);
    assert.equal(verifyWebhookSignature(payload, 'bad'), false);
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});
