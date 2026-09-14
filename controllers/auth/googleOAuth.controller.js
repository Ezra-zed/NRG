import User from '../../models/User.model.js';
import AppError from '../../utils/AppError.js';
import { generateToken } from '../../utils/jwt.js';
import { verifyToken } from '../../utils/jwt.js';
import { publicUser } from '../../utils/publicUser.js';
import { parseCookies, SESSION_COOKIE } from '../../utils/cookies.js';
import {
  cookieOptions,
  createOAuthState,
  GOOGLE_STATE_COOKIE,
  isValidOAuthState,
  oauthStateCookieOptions,
  STATE_MAX_AGE_MS,
} from '../../utils/oauthState.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_PRODUCTION_FRONTEND_URL = 'https://enrg-frontend-uyvb.vercel.app';
const LEGACY_PRODUCTION_FRONTEND_URL = 'https://enrg-front-end-uyv.vercel.app';

const getHomeRedirectUrl = (req) => {
  const host = (req?.headers?.host || '').toLowerCase();
  const isLocalHost = host.includes('localhost')
    || host.includes('127.0.0.1')
    || host.includes('::1');

  if (isLocalHost) {
    return process.env.LOCAL_FRONTEND_URL || `http://localhost:${process.env.FRONTEND_PORT || 3000}`;
  }

  const configuredProductionFrontendUrl = process.env.PRODUCTION_FRONTEND_URL
    || process.env.APP_HOME_URL
    || process.env.FRONTEND_URL;

  // The former Vercel alias was deleted. Preserve an explicitly configured
  // replacement, but migrate the known dead value during the transition.
  const productionFrontendUrl = configuredProductionFrontendUrl === LEGACY_PRODUCTION_FRONTEND_URL
    ? CURRENT_PRODUCTION_FRONTEND_URL
    : configuredProductionFrontendUrl || CURRENT_PRODUCTION_FRONTEND_URL;

  if (!productionFrontendUrl) {
    throw new AppError(
      'Google OAuth is missing a production frontend redirect URL.',
      500,
      true,
      'OAUTH_FRONTEND_URL_MISSING',
    );
  }

  return productionFrontendUrl;
};

const logOAuth = (label, details) => {
  console.log(`[GOOGLE_OAUTH][${label}]`, JSON.stringify(details));
};

export const startGoogleLogin = (req, res, next) => {
  try {
    const state = createOAuthState();
    res.locals.googleOAuthState = state;
    res.cookie(GOOGLE_STATE_COOKIE, state, oauthStateCookieOptions(STATE_MAX_AGE_MS));
    logOAuth('STATE_CREATED', {
      method: req.method,
      url: req.originalUrl,
      stateCookie: GOOGLE_STATE_COOKIE,
      stateExpiresInMs: STATE_MAX_AGE_MS,
    });
    next();
  } catch (error) {
    logOAuth('START_ERROR', { message: error.message });
    next(new AppError(error.message, 500));
  }
};

export const validateGoogleCallbackState = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const stateCookie = cookies[GOOGLE_STATE_COOKIE];
  const queryState = req.query.state;

  const stateValid = isValidOAuthState(queryState);
  const cookieMatches = Boolean(stateCookie && queryState && stateCookie === queryState);

  res.clearCookie(GOOGLE_STATE_COOKIE, oauthStateCookieOptions());
  logOAuth('STATE_VALIDATION', {
    method: req.method,
    url: req.originalUrl,
    hasCookie: Boolean(stateCookie),
    hasQueryState: Boolean(queryState),
    stateValid: Boolean(stateValid),
    cookieMatches: Boolean(cookieMatches),
  });

  // CSRF protection comes from the `state` parameter itself: it is HMAC-signed
  // with the server secret, random per request, and expires after 10 minutes —
  // an attacker can neither forge nor predict a valid state for a victim's
  // flow. The cookie is intentionally BEST-EFFORT only and never blocks a
  // legitimate login:
  //  - missing cookie       → cross-site cookie blocked (Vercel→Render) → allow.
  //  - mismatched cookie    → another flow/tab overwrote it → allow.
  //  - invalid state        → forged/expired → ALWAYS reject.
  if (!stateValid) {
    return next(new AppError('Invalid or expired OAuth state parameter.', 403, true, 'INVALID_OAUTH_STATE'));
  }

  return next();
};

export const finishGoogleLogin = async (profile, req, res) => {
  const email = profile.emails?.[0]?.value?.toLowerCase();
  if (!profile.id || !email) {
    logOAuth('PROFILE_INVALID', {
      hasGoogleId: Boolean(profile.id),
      hasEmail: Boolean(email),
    });
    throw new AppError('Google did not return a usable profile.', 401);
  }

  const oauthId = `google-${profile.id}`;
  let user = await User.findOne({ $or: [{ oauthId }, { email }] });
  let created = false;

  if (!user) {
    user = await User.create({
      role: 'user',
      name: profile.displayName || email,
      email,
      authProvider: 'O-auth',
      oauthId,
    });
    created = true;
  } else if (!user.oauthId) {
    user.oauthId = oauthId;
    await user.save();
  }

  // Resolve this before setting the session cookie so a configuration error
  // cannot leave the browser signed in without a valid redirect destination.
  const homeUrl = getHomeRedirectUrl(req);
  const token = generateToken({ id: user._id.toString(), role: user.role });
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_MS));
  logOAuth('LOGIN_SUCCESS', {
    userId: user._id.toString(),
    created,
    role: user.role,
    sessionCookie: SESSION_COOKIE,
  });

  if (req && req.accepts && req.accepts('html')) {
    return res.redirect(homeUrl);
  }

  return res.json({
    success: true,
    data: { user: publicUser(user), token },
    message: `Signed in with Google${created ? ' — account created' : ''}`,
    error: null,
  });
};

/**
 * GET /auth/me — resolve the current signed-in user.
 *
 * Lets the frontend restore the session on load: with `credentials: 'include'`
 * the browser sends the nrg_session cookie and this returns the signed-in user,
 * so the user "stays signed in" across reloads until the cookie expires (7d).
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      return res.json({ success: true, data: { user: null }, message: 'Not signed in.', error: null });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      return res.json({ success: true, data: { user: null }, message: 'Session expired.', error: null });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      return res.json({ success: true, data: { user: null }, message: 'Session expired.', error: null });
    }

    return res.json({
      success: true,
      data: { user: publicUser(user), token },
      message: 'Signed in.',
      error: null,
    });
  } catch (error) {
    return next(error);
  }
};

export const logout = (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  return res.json({ success: true, data: null, message: 'Logged out.', error: null });
};

export { SESSION_COOKIE };
