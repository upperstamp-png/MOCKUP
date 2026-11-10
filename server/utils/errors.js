'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ServiceNotConfiguredError extends AppError {
  constructor(serviceName, message) {
    super(
      message || `Serviço ${serviceName} não configurado. Configure as credenciais no .env ou painel de Configurações.`,
      503,
      'SERVICE_NOT_CONFIGURED',
      { service: serviceName }
    );
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação obrigatória.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Permissão insuficiente para esta operação.') {
    super(message, 403, 'FORBIDDEN');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Registro não encontrado.') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflito de estado.') {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = {
  AppError,
  ServiceNotConfiguredError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
