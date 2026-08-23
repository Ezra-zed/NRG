/**
 * AppError — application-level error with an explicit HTTP status code.
 *
 * Extends the native Error so it can be `throw`n from anywhere (controllers,
 * strategies, middleware) and be formatted consistently by the central
 * errorHandler middleware.
 */
export default class AppError extends Error {
  /**
   * @param {string} message Human readable error description.
   * @param {number} [statusCode=500] HTTP status code.
   * @param {boolean} [isOperational=true] True for expected/operational errors.
   */
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = String(statusCode).startsWith('4') ? 'fail' : 'error';
    // Capture the stack trace, excluding this constructor frame.
    Error.captureStackTrace?.(this, this.constructor);
  }
}