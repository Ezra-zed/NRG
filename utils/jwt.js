import jwt from 'jsonwebtoken';

/**
 * JWT helpers — access tokens are short-lived and tied to a server-side session.
 *
 * JWT_SECRET is mandatory. Access-token lifetime is fixed at 15 minutes;
 * refresh tokens are opaque, stored separately, and never JWTs.
 */

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || (process.env.NODE_ENV !== 'development' && secret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters outside development.');
  }
  return secret;
};

/**
 * Generate a signed JWT identifying the given user.
 *
 * @param {{ id: string, role: string, sid: string, typ: 'access' }} payload
 *   Token payload (userId, current role, and active session).
 * @returns {string} Signed JWT.
 */
export const generateToken = (payload) => {
  const secret = getSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    audience: 'nrg-client',
    expiresIn: '15m',
    issuer: 'nrg-api',
  });
};

/**
 * Verify and decode a JWT.
 *
 * @param {string} token Raw JWT string.
 * @returns {object} Decoded JWT payload.
 * @throws {JsonWebTokenError} When the token is invalid.
 * @throws {TokenExpiredError} When the token is expired.
 */
export const verifyToken = (token) => {
  const secret = getSecret();
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
    audience: 'nrg-client',
    issuer: 'nrg-api',
  });
};