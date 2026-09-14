/**
 * Reusable Joi validation middleware.
 *
 * Validates and sanitizes req.body / req.query / req.params
 * and passes validation errors to the central error handler.
 *
 * @param {import("joi").AnySchema} schema
 * @param {"body"|"query"|"params"} source
 * @returns {import("express").RequestHandler}
 */
export const validate = (schema, source = "body") => {
  return (req, _res, next) => {
    const { error: validationError, value } = schema.validate(req[source], {
      abortEarly: false,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });

    if (validationError) {
      const details = {};

      for (const issue of validationError.details) {
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

    // Replace request data with Joi's parsed/sanitized data. Express 5 exposes
    // `req.query` as a getter without a setter, so direct assignment throws.
    // Define an own property to preserve the same sanitized-query contract the
    // rest of the application uses, while leaving body and params unchanged.
    if (source === 'query') {
      Object.defineProperty(req, 'query', {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    } else {
      req[source] = value;
    }

    return next();
  };
};
