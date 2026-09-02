/**
 * Reusable Zod validation middleware.
 *
 * Validates and sanitizes req.body / req.query / req.params
 * and passes validation errors to the central error handler.
 *
 * @param {import("zod").ZodSchema} schema
 * @param {"body"|"query"|"params"} source
 * @returns {import("express").RequestHandler}
 */
export const validate = (schema, source = "body") => {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = {};

      for (const issue of result.error.issues) {
        const field = issue.path.length ? issue.path.join(".") : source;

        if (!details[field]) {
          details[field] = [];
        }

        details[field].push(issue.message);
      }

      const error = new Error("Validation failed");
      error.name = "ValidationError";
      error.statusCode = 400;
      error.isOperational = true;
      error.details = details;
      error.validationSource = source;

      return next(error);
    }

    // Replace request data with Zod's parsed/sanitized data.
    req[source] = result.data;

    return next();
  };
};