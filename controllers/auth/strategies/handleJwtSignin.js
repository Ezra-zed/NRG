import User from '../../../models/User.model.js';
import AppError from '../../../utils/AppError.js';
import { generateToken } from '../../../utils/jwt.js';

/**
 * JWT-auth (email + password) sign-in strategy.
 *
 * Loads the user by email, compares the bcrypt hash, and issues a JWT on
 * success. Identical message for missing user / wrong password prevents
 * username enumeration.
 *
 * @param {object} payload Validated request body.
 * @param {string} payload.method Must be 'JWT-auth'.
 * @param {string} payload.email Login email (lowercased by the zod schema).
 * @param {string} payload.password Plain-text password.
 * @returns {Promise<{ user: object, token: string, message: string }>}
 * @throws {AppError} 401 for any credential problem.
 */
export const handleJwtSignin = async (payload) => {
  const { email, password } = payload;

  // Pull the password hash (hidden by default via select:false) for the check.
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new AppError('Invalid email or password.', 401);
  }

  const passwordMatches = await user.comparePassword(password);
  if (!passwordMatches) {
    throw new AppError('Invalid email or password.', 401);
  }

  return {
    user,
    token: generateToken({ id: user._id.toString(), role: user.role }),
    message: 'Signed in successfully with email & password.',
  };
};