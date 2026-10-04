/**
 * Shared cookie helpers for the auth session.
 *
 * Access JWTs and opaque refresh tokens use separate HttpOnly cookies.
 */

export const SESSION_COOKIE = 'nrg_session';
export const REFRESH_COOKIE = 'nrg_refresh';

/** Parse a raw Cookie header into a plain object. */
export const parseCookies = (header = '') => {
  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
};

/**
 * Extract the auth token from a request.
 * Order: `nrg_session` cookie first (browser sessions), then
 * `Authorization: Bearer <token>` (API clients and non-cookie sessions).
 */
export const extractToken = (req) => {
  const header = req.headers.authorization || '';
  const bearer = header.match(/^\s*Bearer\s+(\S+)\s*$/i)?.[1];
  if (bearer) return bearer;

  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
};
