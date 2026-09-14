import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

let configured = false;

/**
 * Resolve the OAuth redirect URI.
 *
 * Order of precedence:
 *  1. OAUTH_REDIRECT_URI            — explicit, always wins. REQUIRED in production
 *                                     and must exactly match a URI registered in
 *                                     Google Cloud Console → Credentials.
 *  2. RENDER_EXTERNAL_URL           — Render injects this automatically
 *                                     (e.g. https://nrg-api.onrender.com).
 *  3. http://localhost:5000/...     — local development default (the port is
 *                                     FIXED, not taken from PORT, so it always
 *                                     matches the Google Console registration).
 */
export const getGoogleCallbackUrl = () => {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;

  if (process.env.RENDER_EXTERNAL_URL) {
    return `${process.env.RENDER_EXTERNAL_URL}/auth/google/callback`;
  }

  return 'http://localhost:5000/auth/google/callback';
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
