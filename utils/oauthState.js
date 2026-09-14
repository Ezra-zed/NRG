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

export const cookieOptions = (maxAge) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // Production frontends are cross-site (Vercel → Render API); the browser
    // only accepts/sends cookies cross-site with SameSite=None + Secure.
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge,
    path: '/',
  };
};

/**
 * Cookie options for the OAuth CSRF state cookie.
 *
 * Unlike the session cookie, the state cookie is only ever consumed on the
 * OAuth callback — a top-level GET navigation from Google back to the API.
 * SameSite=Lax is sufficient for that (Lax cookies ARE sent on cross-site
 * top-level navigations) and it avoids the "SameSite=None requires Secure"
 * blocking rule, so strict browsers are far more likely to store and send it
 * back than a SameSite=None cookie dropped during a cross-site redirect chain.
 */
export const oauthStateCookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge,
  path: '/',
});

export { STATE_MAX_AGE_MS };
