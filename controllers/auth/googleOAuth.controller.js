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
  STATE_MAX_AGE_MS,
} from '../../utils/oauthState.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getHomeRedirectUrl = (req) => {
  const host = (req?.headers?.host || '').toLowerCase();
  const isLocalHost = host.includes('localhost')
    || host.includes('127.0.0.1')
    || host.includes('::1');

  if (isLocalHost) {
    return process.env.LOCAL_FRONTEND_URL || `http://localhost:${process.env.FRONTEND_PORT || 3000}`;
  }

  return process.env.PRODUCTION_FRONTEND_URL
    || process.env.APP_HOME_URL
    || process.env.FRONTEND_URL
    || 'https://enrg-front-end-uyv.vercel.app';
};

const logOAuth = (label, details) => {
  console.log(`[GOOGLE_OAUTH][${label}]`, JSON.stringify(details));
};

export const startGoogleLogin = (req, res, next) => {
  try {
    const state = createOAuthState();
    res.locals.googleOAuthState = state;
    res.cookie(GOOGLE_STATE_COOKIE, state, cookieOptions(STATE_MAX_AGE_MS));
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
  const valid = req.query.state && stateCookie
    && req.query.state === stateCookie
    && isValidOAuthState(stateCookie);

  res.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions());
  logOAuth('STATE_VALIDATION', {
    method: req.method,
    url: req.originalUrl,
    hasCookie: Boolean(stateCookie),
    hasQueryState: Boolean(req.query.state),
    matches: Boolean(req.query.state && stateCookie && req.query.state === stateCookie),
    valid: Boolean(valid),
  });
  if (!valid) {
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

  const token = generateToken({ id: user._id.toString(), role: user.role });
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_MS));
  logOAuth('LOGIN_SUCCESS', {
    userId: user._id.toString(),
    created,
    role: user.role,
    sessionCookie: SESSION_COOKIE,
  });

  const homeUrl = getHomeRedirectUrl(req);
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
