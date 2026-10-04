import assert from 'node:assert/strict';
import test from 'node:test';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';

const call = (limiter) => new Promise((resolve) => {
  limiter({ ip: '127.0.0.1' }, {}, (error) => resolve(error || null));
});

test('rate limits are isolated per endpoint and enforce each configured maximum', async () => {
  const signinLimiter = rateLimit({ max: 1 });
  const refreshLimiter = rateLimit({ max: 1 });

  assert.equal(await call(signinLimiter), null);
  assert.equal((await call(signinLimiter)).statusCode, 429);
  assert.equal(await call(refreshLimiter), null);
});
