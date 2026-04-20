/**
 * Validation Middleware
 * Uses Zod for strict schema validation
 */
const { ValidationError } = require('../errors');

const validate = (schema) => (req, res, next) => {
  try {
    const data = {
      ...req.body,
      ...req.query,
      ...req.params,
    };

    const validated = schema.parse(data);
    
    // Optionally update req with validated data to ensure type safety
    // For now we just check it
    
    next();
  } catch (err) {
    const fields = {};
    if (err.errors) {
      err.errors.forEach((e) => {
        fields[e.path.join('.')] = e.message;
      });
    }
    
    next(new ValidationError('Input validation failed', fields));
  }
};

module.exports = validate;
