import jwt from 'jsonwebtoken';

/**
 * JWT helpers — generateToken() and verifyToken().
 *
 * Secrets are read from the environment; JWT_SECRET is mandatory.
 * JWT_EXPIRES_IN controls token lifetime (e.g. "7d", "2h", "30m").
 */

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. Refusing to sign/verify tokens.');
  }
  return secret;
};

/**
 * Generate a signed JWT identifying the given user.
 *
 * @param {{ id: string, role: string }} payload Token payload (userId + role).
 * @returns {string} Signed JWT.
 */
export const generateToken = (payload) => {
  const secret = getSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn, issuer: 'nrg-api' });
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
  return jwt.verify(token, secret, { issuer: 'nrg-api' });
};