const { ValidationError } = require('../errors');

/**
 * Validates and normalizes JSON bodies while keeping validation reusable across
 * Express modules. Parsed defaults/transforms are made available to controllers.
 */
const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (result.success) {
    req.body = result.data;
    return next();
  }

  const fields = Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.join('.') || 'body',
      issue.message,
    ]),
  );
  return next(new ValidationError('Input validation failed.', fields));
};

module.exports = validateBody;
