import AppError from '../utils/AppError.js';

const windowMs = Number(process.env.ASSISTANT_RATE_LIMIT_WINDOW_MS) || 60_000;
const maxRequests = Number(process.env.ASSISTANT_RATE_LIMIT_MAX) || 10;
const requests = new Map();

const getKey = (req) => String(req.user?._id || req.user?.id || 'anonymous');

export const companyAssistantRateLimit = (req, _res, next) => {
  const key = getKey(req);
  const now = Date.now();
  const current = requests.get(key);
  const entry = current && now - current.startedAt < windowMs
    ? current
    : { startedAt: now, count: 0 };

  entry.count += 1;
  requests.set(key, entry);

  if (entry.count > maxRequests) {
    return next(new AppError('Assistant rate limit exceeded. Try again later.', 429));
  }

  return next();
};

export const clearCompanyAssistantRateLimit = () => requests.clear();