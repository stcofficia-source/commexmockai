/**
 * Custom Error Classes
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_ERROR');
  }
}

class SessionError extends AppError {
  constructor(message = 'Session not found or expired') {
    super(message, 404, 'SESSION_ERROR');
  }
}

class AIServiceError extends AppError {
  constructor(message = 'AI service temporarily unavailable') {
    super(message, 503, 'AI_SERVICE_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  SessionError,
  AIServiceError,
};
