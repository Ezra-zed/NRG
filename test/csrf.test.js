import assert from 'node:assert/strict';
import test from 'node:test';
import protectCookieAuthenticatedWrites from '../middlewares/csrf.middleware.js';
import { SESSION_COOKIE } from '../utils/cookies.js';

process.env.LOCAL_FRONTEND_URL = 'http://localhost:3000/';

const run = (req) => new Promise((resolve) => {
  protectCookieAuthenticatedWrites(req, {}, (error) => resolve(error || null));
});

const request = ({ method = 'POST', origin, cookie = `${SESSION_COOKIE}=access-token` } = {}) => ({
  method,
  headers: { cookie },
  get(name) {
    if (name.toLowerCase() === 'origin') return origin;
    return undefined;
  },
});

test('cookie-authenticated writes reject an untrusted origin', async () => {
  const error = await run(request({ origin: 'https://attacker.example' }));
  assert.equal(error?.errorCode, 'CSRF_BLOCKED');
});

test('cookie-authenticated writes accept a configured frontend origin', async () => {
  assert.equal(await run(request({ origin: 'http://localhost:3000' })), null);
});

test('bearer-only requests and safe methods do not require an Origin header', async () => {
  assert.equal(await run(request({ cookie: '', origin: undefined })), null);
  assert.equal(await run(request({ method: 'GET', origin: 'https://attacker.example' })), null);
});

test('cookie-authenticated writes without Origin or Referer fail closed', async () => {
  const error = await run(request({ origin: undefined }));
  assert.equal(error?.errorCode, 'CSRF_BLOCKED');
});
