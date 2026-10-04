import User from '../../models/User.model.js';
import AppError from '../../utils/AppError.js';
import { verifyToken } from '../../utils/jwt.js';
import { publicUser } from '../../utils/publicUser.js';
import { parseCookies, SESSION_COOKIE } from '../../utils/cookies.js';
import AuthSession from '../../models/AuthSession.model.js';
import {
  clearAuthCookies,
  createAuthSession,
  refreshAuthSession,
  revokeAuthSession,
} from '../../utils/authSession.js';
import {
  createOAuthState,
  GOOGLE_STATE_COOKIE,
  isValidOAuthState,
  oauthStateCookieOptions,
  STATE_MAX_AGE_MS,
} from '../../utils/oauthState.js';
import { DEFAULT_PRODUCTION_FRONTEND_URL } from '../../utils/securityConfig.js';

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
    ? DEFAULT_PRODUCTION_FRONTEND_URL
    : configuredProductionFrontendUrl || DEFAULT_PRODUCTION_FRONTEND_URL;

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

  if (!stateValid || !cookieMatches) {
    return next(new AppError('Invalid or expired OAuth state parameter.', 403, true, 'INVALID_OAUTH_STATE'));
  }

  return next();
};

export const finishGoogleLogin = async (profile, req, res) => {
  const emailProfile = profile.emails?.[0];
  const email = emailProfile?.value?.toLowerCase();
  const emailVerified = emailProfile?.verified === true
    || profile._json?.email_verified === true
    || profile._json?.email_verified === 'true';
  if (!profile.id || !email || !emailVerified) {
    logOAuth('PROFILE_INVALID', {
      hasGoogleId: Boolean(profile.id),
      hasEmail: Boolean(email),
      emailVerified,
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
  const token = await createAuthSession(user, res);
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
 * GET /auth/me — resolve the current signed-in user or return 401.
 *
 * Lets the frontend restore the session on load: with `credentials: 'include'`
 * the browser sends the nrg_session cookie and this returns the signed-in user,
 * so the user stays signed in across reloads. The frontend can rotate an
 * expired access cookie through POST /api/refresh.
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    res.set({
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.vary('Cookie');
    res.vary('Authorization');
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      return next(new AppError('Not authenticated.', 401));
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      clearAuthCookies(res);
      return next(new AppError('Session expired.', 401));
    }

    if (decoded.typ !== 'access' || typeof decoded.sid !== 'string' || typeof decoded.id !== 'string') {
      clearAuthCookies(res);
      return next(new AppError('Session expired.', 401));
    }

    const session = await AuthSession.findOne({
      _id: decoded.sid,
      userId: decoded.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).select('_id').lean();
    if (!session) {
      clearAuthCookies(res);
      return next(new AppError('Session expired.', 401));
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      clearAuthCookies(res);
      return next(new AppError('Session expired.', 401));
    }

    return res.json({
      success: true,
      data: { user: publicUser(user) },
      message: 'Signed in.',
      error: null,
    });
  } catch (error) {
    return next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const token = await refreshAuthSession(req, res);
    return res.json({
      success: true,
      data: { token },
      message: 'Session refreshed.',
      error: null,
    });
  } catch (error) {
    return next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    await revokeAuthSession(req, res);
  } catch (error) {
    return next(error);
  }
  return res.json({ success: true, data: null, message: 'Logged out.', error: null });
};

export { SESSION_COOKIE };
