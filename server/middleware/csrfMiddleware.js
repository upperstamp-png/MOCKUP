'use strict';

const { signCsrfToken, verifyCsrfToken } = require('../utils/crypto');
const { ForbiddenError } = require('../utils/errors');

function requireCsrf(req, _res, next) {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    return next();
  }
  const token = req.get('x-csrf-token');
  const sessionHint = req.sessionTokenHint || 'anon';
  if (!verifyCsrfToken(token, sessionHint)) {
    return next(new ForbiddenError('Token CSRF inválido ou ausente. Recarregue a página administrativa.'));
  }
  return next();
}

function issueCsrfToken(req) {
  return signCsrfToken(req.sessionTokenHint || 'anon');
}

module.exports = {
  requireCsrf,
  issueCsrfToken
};
