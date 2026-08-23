/**
 * Wrap an async Express route handler so that any rejected promise is
 * automatically forwarded to the next() error middleware. This prevents
 * unhandled promise rejections from crashing the process.
 *
 * @param {import('express').RequestHandler} handler Async route handler.
 * @returns {import('express').RequestHandler} Wrapped handler.
 */
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export default asyncHandler;