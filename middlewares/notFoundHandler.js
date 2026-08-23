import { sendError } from '../utils/apiResponse.js';

/**
 * 404 handler for unmatched routes.
 *
 * Mounted after all API routes so any request that reaches it simply doesn't
 * match anything. Delegates to the central error handler via next().
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function notFoundHandler(req, res, next) {
  sendError(
    res,
    404,
    `Route not found: ${req.method} ${req.originalUrl}`,
    { method: req.method, url: req.originalUrl }
  );
}