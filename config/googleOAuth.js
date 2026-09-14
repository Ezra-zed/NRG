import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

let configured = false;

const PRODUCTION_CALLBACK_URL = 'https://enrg-front-end-uyv.vercel.app/auth/google/callback';
const DEVELOPMENT_CALLBACK_URL = 'http://localhost:5000/auth/google/callback';

/**
 * Resolve the OAuth redirect URI.
 *
 * Order of precedence:
 *  1. OAUTH_REDIRECT_URI            — explicit, always wins. Must exactly match
 *                                     a URI registered in Google Cloud Console →
 *                                     Credentials.
 *  2. http://localhost:5000/...     — local development default (the port is
 *                                     FIXED, not taken from PORT, so it always
 *                                     matches the Google Console registration).
 *  3. Production (Vercel) callback  — https://enrg-front-end-uyv.vercel.app/
 *                                     auth/google/callback.
 */
export const getGoogleCallbackUrl = () => {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;

  if (process.env.NODE_ENV !== 'production') return DEVELOPMENT_CALLBACK_URL;

  return PRODUCTION_CALLBACK_URL;
};

export const configureGoogleStrategy = () => {
  if (configured) return;

  const { OAUTH_CLIENT_ID: clientID, OAUTH_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientID || !clientSecret) {
    throw new Error('OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET must be set for Google OAuth.');
  }

  passport.use('google', new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL: getGoogleCallbackUrl(),
    },
    (_accessToken, _refreshToken, profile, done) => done(null, profile),
  ));

  configured = true;
};

export default passport;
