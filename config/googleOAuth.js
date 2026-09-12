import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

let configured = false;

export const getGoogleCallbackUrl = () => process.env.OAUTH_REDIRECT_URI
  || `http://localhost:${process.env.PORT || 5000}/auth/google/callback`;

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
