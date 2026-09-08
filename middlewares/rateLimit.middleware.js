import AppError from '../utils/AppError.js';

const buckets = new Map();

/** Lightweight process-local limiter for sensitive write endpoints. */
export const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 30, message = 'Too many requests. Please try again later.' } = {}) => (req, _res, next) => {
  const key = req.user?._id?.toString() || req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return next(new AppError(message, 429, true, 'RATE_LIMITED'));
  }
  return next();
};