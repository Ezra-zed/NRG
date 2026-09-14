import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

let configured = false;

/**
 * Resolve the OAuth redirect URI.
 *
 * Order of precedence:
 *  1. OAUTH_REDIRECT_URI            — explicit, always wins. Must exactly match
 *                                     a URI registered in Google Cloud Console →
 *                                     Credentials.
 *  2. RENDER_EXTERNAL_URL           — Render injects this automatically
 *                                     (e.g. https://nrg-api.onrender.com).
 *                                     The callback MUST hit this API — the code
 *                                     exchange happens in /auth/google/callback
 *                                     here, not on the static frontend.
 *  3. http://localhost:5000/...     — local development default (the port is
 *                                     FIXED, not taken from PORT, so it always
 *                                     matches the Google Console registration).
 */
export const getGoogleCallbackUrl = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Explicit override always wins — BUT in production a stale override that
  // points at the frontend (Vercel) or localhost is a known footgun: Google
  // then redirects the browser somewhere the state/session cookie is never
  // sent, producing INVALID_OAUTH_STATE. Detect it and fall back to the
  // Render URL while warning loudly.
  const override = process.env.OAUTH_REDIRECT_URI;
  if (override) {
    const looksStale = override.startsWith('http://localhost')
      || override.includes('127.0.0.1')
      || override.includes('.vercel.app');
    if (isProduction && looksStale) {
      console.warn(`[GOOGLE_OAUTH][CONFIG] Ignoring suspicious OAUTH_REDIRECT_URI in production: ${override}`);
    } else {
      return override;
    }
  }

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

  const callbackURL = getGoogleCallbackUrl();
  console.log(`[GOOGLE_OAUTH][CONFIG] callbackURL=${callbackURL}`);

  passport.use('google', new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
    },
    (_accessToken, _refreshToken, profile, done) => done(null, profile),
  ));

  configured = true;
};

export default passport;
