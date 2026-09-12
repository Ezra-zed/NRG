import { Router } from 'express';
import passport from '../config/googleOAuth.js';
import { configureGoogleStrategy } from '../config/googleOAuth.js';
import {
  finishGoogleLogin,
  logout,
  startGoogleLogin,
  validateGoogleCallbackState,
} from '../controllers/auth/googleOAuth.controller.js';
import AppError from '../utils/AppError.js';

const router = Router();

const logOAuthRequest = (label, req, details = {}) => {
  console.log(`[GOOGLE_OAUTH][${label}]`, JSON.stringify({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent') || null,
    query: {
      hasCode: Boolean(req.query.code),
      hasState: Boolean(req.query.state),
      error: req.query.error || null,
      errorDescription: req.query.error_description || null,
    },
    ...details,
  }));
};

router.get('/google', (req, res, next) => {
  logOAuthRequest('START_REQUEST', req);
  configureGoogleStrategy();
  return startGoogleLogin(req, res, (error) => {
    if (error) return next(error);
    logOAuthRequest('REDIRECTING_TO_GOOGLE', req, {
      callbackUrl: process.env.OAUTH_REDIRECT_URI
        || `http://localhost:${process.env.PORT || 5000}/auth/google/callback`,
      scope: ['profile', 'email'],
    });
    return passport.authenticate('google', {
      session: false,
      state: res.locals.googleOAuthState,
      scope: ['profile', 'email'],
    })(req, res, next);
  });
});

router.get('/google/callback', validateGoogleCallbackState, (req, res, next) => {
  logOAuthRequest('CALLBACK_REQUEST', req);
  configureGoogleStrategy();
  if (req.query.error === 'access_denied') {
    logOAuthRequest('CONSENT_DENIED', req);
    return next(new AppError('Google consent was denied.', 403, true, 'GOOGLE_CONSENT_DENIED'));
  }

  return passport.authenticate('google', { session: false, state: false }, (error, profile) => {
    if (error) {
      logOAuthRequest('PROVIDER_ERROR', req, {
        errorCode: error.code || error.name || 'UNKNOWN',
        errorMessage: error.message || 'Unknown provider error',
      });
      const message = error.code === 'ETIMEDOUT'
        ? 'Google OAuth timed out. Please try again.'
        : 'Google sign-in failed.';
      return next(new AppError(message, 401, true, 'GOOGLE_OAUTH_FAILED'));
    }
    if (!profile) {
      logOAuthRequest('EMPTY_PROFILE', req);
      return next(new AppError('Google consent was denied.', 403, true, 'GOOGLE_CONSENT_DENIED'));
    }

    logOAuthRequest('PROFILE_RECEIVED', req, {
      hasGoogleId: Boolean(profile.id),
      hasEmail: Boolean(profile.emails?.[0]?.value),
      hasDisplayName: Boolean(profile.displayName),
    });
    return finishGoogleLogin(profile, res).catch(next);
  })(req, res, next);
});

router.get('/logout', logout);

export default router;
