/**
 * validate — reusable middleware factory.
 *
 * Parses the request input against a zod schema and attaches the parsed &
 * sanitized values back onto req[key]. On failure it forwards a formatted
 * 400 error to the central error handler.
 *
 * @param {import('zod').ZodSchema} schema zod schema to validate against.
 * @param {'body'|'query'|'params'} [source='body'] which request part to validate.
 * @returns {import('express').RequestHandler}
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const formatted = Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join('.') || source,
        issue.message,
      ])
    );

    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.statusCode = 400;
    error.isOperational = true;
    error.details = formatted;

    return next(error);
  }

  // Mutate req so controllers always consume the parsed/sanitized data.
  req[source] = result.data;
  return next();
};