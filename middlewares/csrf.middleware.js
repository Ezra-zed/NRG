import AppError from '../utils/AppError.js';
import { REFRESH_COOKIE, SESSION_COOKIE, parseCookies } from '../utils/cookies.js';
import { getAllowedOrigins } from '../utils/securityConfig.js';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export default function protectCookieAuthenticatedWrites(req, _res, next) {
  if (!unsafeMethods.has(req.method)) return next();

  const cookies = parseCookies(req.headers.cookie);
  if (!cookies[SESSION_COOKIE] && !cookies[REFRESH_COOKIE]) return next();

  const requestOrigin = req.get('origin');
  const referer = req.get('referer');
  if (!requestOrigin && !referer) {
    return next(new AppError('Origin is required for cookie-authenticated writes.', 403, true, 'CSRF_BLOCKED'));
  }

  let origin;
  try {
    origin = new URL(requestOrigin || referer).origin;
  } catch {
    return next(new AppError('Invalid request origin.', 403, true, 'CSRF_BLOCKED'));
  }

  if (!getAllowedOrigins().includes(origin)) {
    return next(new AppError('Cross-origin cookie-authenticated request rejected.', 403, true, 'CSRF_BLOCKED'));
  }
  return next();
}
