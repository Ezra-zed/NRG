import User from '../../../models/User.model.js';
import AppError from '../../../utils/AppError.js';
import { generateToken } from '../../../utils/jwt.js';

/**
 * Verify a Google token issued directly by Google or through Supabase Auth.
 *
 * @param {'google'} provider OAuth provider name.
 * @param {string} token OAuth access token from the client.
 * @returns {Promise<{ id: string, email: string, name: string, provider: string }>}
 * @throws {AppError} 401 when the token is invalid.
 * @throws {AppError} 501 when provider configuration is missing.
 */
async function verifyOAuthToken(provider, token) {
  if (provider !== 'google') {
    throw new AppError(`OAuth provider ${provider} is not configured.`, 501);
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && !supabaseAnonKey) {
    throw new AppError('SUPABASE_ANON_KEY is required when SUPABASE_URL is configured.', 501);
  }

  if (supabaseUrl && supabaseAnonKey) {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const profile = await response.json();
      const metadata = profile.user_metadata || {};
      const googleIdentity = profile.identities?.find((identity) => identity.provider === 'google');
      const providerId = googleIdentity?.identity_data?.sub || profile.id;

      if (!providerId || !profile.email) {
        throw new AppError('Supabase OAuth profile is incomplete.', 401);
      }

      return {
        id: `google-${providerId}`,
        email: profile.email,
        name: metadata.full_name || metadata.name || profile.email,
        provider,
      };
    }
  }

  if (!process.env.OAUTH_CLIENT_ID) {
    throw new AppError('OAUTH_CLIENT_ID is missing.', 501);
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new AppError('Google OAuth token is invalid or expired.', 401);
  }

  const profile = await response.json();
  if (profile.aud !== process.env.OAUTH_CLIENT_ID || !profile.sub || !profile.email) {
    throw new AppError('Google OAuth token audience or profile is invalid.', 401);
  }

  return {
    id: `google-${profile.sub}`,
    email: profile.email,
    name: profile.name || profile.email,
    provider,
  };
}

/**
 * OAuth sign-in strategy.
 *
 * Verifies the token with the provider, then finds the account by oauthId or
 * transparently creates one, and issues the session JWT.
 *
 * @param {object} payload Validated request body.
 * @param {string} payload.method Must be 'O-auth'.
 * @param {string} payload.oauthProvider e.g. 'google'.
 * @param {string} payload.oauthToken Provider-issued access token.
 * @returns {Promise<{ user: object, token: string, message: string }>}
 * @throws {AppError} 401 when the token cannot be verified.
 */
export const handleOAuthSignin = async (payload) => {
  const { oauthProvider: provider, oauthToken: token } = payload;

  let profile;
  try {
    profile = await verifyOAuthToken(provider, token);
  } catch (error) {
    throw new AppError(`Unable to verify ${provider} token. Invalid or expired OAuth credentials.`, 401);
  }

  // Reuse an existing provider account or link a verified email account.
  let user = await User.findOne({
    $or: [{ oauthId: profile.id }, { email: profile.email }],
  });
  let created = false;

  if (!user) {
    user = await User.create({
      role: 'user',
      name: profile.name,
      email: profile.email,
      authProvider: 'O-auth',
      oauthId: profile.id,
    });
    created = true;
  }

  return {
    user,
    token: generateToken({ id: user._id.toString(), role: user.role }),
    message: `Signed in with ${provider}${created ? ' — account created' : ''}`,
  };
};