'use strict';

const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Handled AppError 5xx', { path: req.originalUrl, code: err.code, message: err.message });
    }
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    });
  }

  logger.error('Unhandled server error', {
    path: req.originalUrl,
    method: req.method,
    error: err.message
  });

  const isProd = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProd ? 'Erro interno ao processar a solicitação.' : err.message
    }
  });
}

module.exports = { errorHandler };
