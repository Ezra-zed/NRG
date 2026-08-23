import crypto from 'node:crypto';
import User from '../../../models/User.model.js';
import AppError from '../../../utils/AppError.js';
import { generateToken } from '../../../utils/jwt.js';

/**
 * Verify an OAuth access token with the provider.
 *
 * STUB — the only placeholder in the auth engine. Replace the body with a real
 * provider verification call, e.g. for Google:
 *   const res   = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
 *   const profile = await res.json();
 * In development a deterministic profile is derived from the token hash so the
 * full flow stays testable offline.
 *
 * @param {'google'} provider OAuth provider name.
 * @param {string} token OAuth access token from the client.
 * @returns {Promise<{ id: string, email: string, name: string, provider: string }>}
 * @throws {AppError} 501 when the provider verification is not configured.
 */
async function verifyOAuthToken(provider, token) {
  // Real provider verification is a hard requirement for production use.
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('OAuth provider verification is not configured for production.', 501);
  }

  const digest = crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
  return {
    id: `${provider}-${digest}`,
    email: `oauth-${digest}@${provider}.stub`,
    name: 'OAuth User',
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

  // Find or create the user keyed by the provider-stable oauthId.
  let user = await User.findOne({ oauthId: profile.id });
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