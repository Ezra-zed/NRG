import crypto from 'node:crypto';
import AppError from '../utils/AppError.js';

const apiBase = 'https://api.razorpay.com/v1';

export function getRazorpayConfig() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  if (!keyId || !keySecret) throw new AppError('Payment service is not configured.', 503, true, 'PAYMENTS_UNAVAILABLE');
  return { keyId, keySecret };
}

export function amountToPaise(rupees) {
  if (!Number.isFinite(rupees) || rupees <= 0) throw new AppError('The selected quote has an invalid amount.', 409, true, 'INVALID_QUOTE_AMOUNT');
  const paise = Math.round(rupees * 100);
  if (!Number.isSafeInteger(paise) || paise < 1) throw new AppError('The selected quote has an invalid amount.', 409, true, 'INVALID_QUOTE_AMOUNT');
  return paise;
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const { keyId, keySecret } = getRazorpayConfig();
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AppError('Payment provider could not be reached. Check payment status before retrying.', 503, true, 'PAYMENT_PROVIDER_UNAVAILABLE');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code || 'PAYMENT_PROVIDER_ERROR';
    throw new AppError('Payment provider rejected the request.', response.status >= 500 ? 502 : 422, true, code);
  }
  return data;
}

export const createRazorpayOrder = (body) => razorpayRequest('/orders', { method: 'POST', body });
export const fetchRazorpayPayment = (paymentId) => razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);

export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const { keySecret } = getRazorpayConfig();
  if (![orderId, paymentId, signature].every((value) => typeof value === 'string' && value.length > 0)) return false;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'hex'); } catch { return false; }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new AppError('Payment webhook is not configured.', 503, true, 'WEBHOOK_UNAVAILABLE');
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'hex'); } catch { return false; }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
