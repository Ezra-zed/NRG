/**
 * Consistent JSON response shape used by every route in the API:
 *
 *   { success: boolean, data: any, message: string, error: any }
 *
 * Centralising the shape here keeps every controller response uniform.
 */

/**
 * Send a success response.
 * @param {import('express').Response} res Express response object.
 * @param {number} statusCode HTTP status code (defaults to 200).
 * @param {*} data Response payload.
 * @param {string} message Optional human readable message.
 */
export const sendSuccess = (res, statusCode = 200, data = null, message = 'Success') => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    error: null,
  });
};

/**
 * Send a failure response.
 * @param {import('express').Response} res Express response object.
 * @param {number} statusCode HTTP status code.
 * @param {string} [message] Human readable error description.
 * @param {*} [error] Additional error detail (stack trace, validation issues…).
 */
export const sendError = (res, statusCode = 500, message = 'Internal server error', error = null) => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error,
  });
};

/**
 * Standard pagination envelope used by list endpoints.
 * @param {Array} docs The page of documents.
 * @param {number} total Total number of matching documents.
 * @param {number} page Current page (1-based).
 * @param {number} limit Page size.
 */
export const paginate = (docs, total, page, limit) => ({
  items: docs,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  },
});