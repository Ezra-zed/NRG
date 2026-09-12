import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const GOOGLE_STATE_COOKIE = 'nrg_google_oauth_state';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

const getStateSecret = () => process.env.JWT_SECRET || process.env.OAUTH_CLIENT_SECRET;

const signState = (state) => createHmac('sha256', getStateSecret()).update(state).digest('base64url');

export const createOAuthState = () => {
  if (!getStateSecret()) {
    throw new Error('JWT_SECRET or OAUTH_CLIENT_SECRET must be set for OAuth state protection.');
  }

  const state = `${Date.now()}.${randomBytes(24).toString('base64url')}`;
  return `${state}.${signState(state)}`;
};

export const isValidOAuthState = (value) => {
  if (!value) return false;

  const separator = value.lastIndexOf('.');
  if (separator < 1) return false;

  const state = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const timestamp = Number(state.split('.')[0]);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > STATE_MAX_AGE_MS || Date.now() < timestamp) {
    return false;
  }

  const expected = signState(state);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
};

export const cookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge,
  path: '/',
});

export { STATE_MAX_AGE_MS };
