import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createOAuthState, GOOGLE_STATE_COOKIE } from '../utils/oauthState.js';
import { validateGoogleCallbackState } from '../controllers/auth/googleOAuth.controller.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'oauth-state-test-secret';

const makeRes = () => ({ clearCookie: () => {} });

const runMiddleware = (req) => new Promise((resolve) => {
  validateGoogleCallbackState(req, makeRes(), (error) => resolve(error || null));
});

test('oauth state: valid state with matching cookie passes', async () => {
  const state = createOAuthState();
  const error = await runMiddleware({
    headers: { cookie: `${GOOGLE_STATE_COOKIE}=${state}` },
    query: { state },
  });
  assert.equal(error, null);
});

test('oauth state: valid state WITHOUT cookie passes (cookie-blocked browsers)', async () => {
  const state = createOAuthState();
  const error = await runMiddleware({ headers: {}, query: { state } });
  assert.equal(error, null);
});

test('oauth state: valid state with a mismatched cookie passes (overwritten by another tab/flow)', async () => {
  const state = createOAuthState();
  const other = createOAuthState();
  const error = await runMiddleware({
    headers: { cookie: `${GOOGLE_STATE_COOKIE}=${other}` },
    query: { state },
  });
  assert.equal(error, null);
});

test('oauth state: forged (tampered) state is rejected', async () => {
  const state = createOAuthState();
  const error = await runMiddleware({ headers: {}, query: { state: `${state}tampered` } });
  assert.ok(error);
  assert.equal(error.errorCode, 'INVALID_OAUTH_STATE');
});

test('oauth state: missing state is rejected', async () => {
  const error = await runMiddleware({ headers: {}, query: {} });
  assert.ok(error);
  assert.equal(error.errorCode, 'INVALID_OAUTH_STATE');
});

test('oauth state: expired state is rejected', async () => {
  const state = createOAuthState();
  const [, randomPart] = state.split('.');
  const sign = (value) => createHmac('sha256', process.env.JWT_SECRET).update(value).digest('base64url');
  const expired = `1.${randomPart}.${sign(`1.${randomPart}`)}`; // timestamp 1 = 1970 → long expired
  const error = await runMiddleware({ headers: {}, query: { state: expired } });
  assert.ok(error);
  assert.equal(error.errorCode, 'INVALID_OAUTH_STATE');
});