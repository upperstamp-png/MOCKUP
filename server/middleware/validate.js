'use strict';

const { ValidationError } = require('../utils/errors');

function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message
      }));
      return next(new ValidationError(details[0]?.message || 'Dados inválidos.', details));
    }
    req.validatedBody = result.data;
    return next();
  };
}

module.exports = { validateBody };
