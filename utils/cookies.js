/**
 * Shared cookie helpers for the auth session.
 *
 * The Google OAuth callback signs the application JWT and stores it in an
 * httpOnly cookie (`nrg_session`). These helpers let both the OAuth controller
 * and the generic authenticate middleware read the session without duplicating
 * parsing logic or adding the cookie-parser dependency.
 */

/** Name of the httpOnly cookie holding the app JWT after OAuth sign-in. */
export const SESSION_COOKIE = 'nrg_session';

/** Parse a raw Cookie header into a plain object. */
export const parseCookies = (header = '') => Object.fromEntries(
  header.split(';')
    .map((part) => part.trim().split('='))
    .filter(([name, value]) => name && value)
    .map(([name, ...value]) => [name, decodeURIComponent(value.join('='))]),
);

/**
 * Extract the auth token from a request.
 * Order: `Authorization: Bearer <token>` header first (API clients),
 * then the `nrg_session` cookie (browser sessions after OAuth).
 */
export const extractToken = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (token && scheme.toLowerCase() === 'bearer') return token;

  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
};
