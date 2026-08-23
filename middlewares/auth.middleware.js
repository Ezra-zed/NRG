import AppError from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.model.js';

/**
 * Authentication middleware.
 *
 * Reads `Authorization: Bearer <token>` from the request headers, verifies the
 * JWT with utils/jwt (which also enforces JWT_SECRET), reloads the user from
 * MongoDB so deleted/suspended accounts are rejected, and attaches the user
 * document to req.user for downstream handlers.
 *
 * @swagger
 * securityDefinitions:
 *   bearerAuth:
 *     type: http
 *     scheme: bearer
 *     bearerFormat: JWT
 *
 * @throws {AppError} 401 when the header/token is missing or invalid.
 * @throws {AppError} 401 when the user no longer exists.
 */
export default async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (!token || scheme.toLowerCase() !== 'bearer') {
      throw new AppError('Not authenticated. Provide a Bearer token.', 401);
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      throw new AppError('Invalid or expired token.', 401);
    }

    const user = await User.findById(decoded.id).select('-password').lean();
    if (!user) {
      throw new AppError('User account not found.', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}