import { sendError } from '../utils/apiResponse.js';

/**
 * Central error-handling middleware.
 *
 * Formats every error — application errors, Mongoose errors and unexpected
 * exceptions — into the consistent response shape:
 *   { success: false, data: null, message, error }
 *
 * Mongoose-specific handling:
 *  - CastError          → 400 (invalid ObjectId / wrong type)
 *  - ValidationError    → 400 (field-level validation failures)
 *  - duplicate key 11000 → 409 (unique constraint violation)
 *
 * @param {Error} err Incoming error.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let error = null;

  // --- Mongoose CastError: invalid ObjectId or wrong value type -------------
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for "req.${err.path}": <${err.value}>. Expected a valid ${err.kind}.`;
    error = { path: err.path, value: err.value, kind: err.kind };
  }

  // --- Mongoose ValidationError: schema validation failed ---------------------
  // (also covers the zod-derived validation error raised by validate.middleware)
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed.';
    error = err.details
      ?? Object.fromEntries(
          Object.entries(err.errors || {}).map(([field, e]) => [field, e.message])
        );
  }

  // --- MongoDB duplicate key (E11000) ----------------------------------------
  if (err.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(err.keyPattern || {});
    message = `Duplicate value for field(s): ${fields.join(', ')}. A record with this value already exists.`;
    error = { duplicateFields: fields, keyValue: err.keyValue };
  }

  // --- JWT errors from jsonwebtoken ------------------------------------------
  if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
    statusCode = 401;
    message = err.name === 'TokenExpiredError'
      ? 'Token has expired.'
      : 'Invalid authentication token.';
    error = err.message;
  }

  // Never leak internals of unexpected 500s in production.
  if (!err.isOperational && process.env.NODE_ENV === 'production') {
    message = 'Internal Server Error';
    error = null;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${statusCode} — ${message}`);
    if (err.stack) console.error(err.stack);
  }

  sendError(res, statusCode, message, error);
}