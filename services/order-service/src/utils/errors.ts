// src/utils/errors.ts
// Custom error classes

export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number, isOperational = true, details?: any) {
    super(message);
    Object.setPrototypeOf(this, BaseError.prototype);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 400, true, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class BadRequestError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 400, true, details);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, true);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, true);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class InternalServerError extends BaseError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, true, details);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, true);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, true, { originalError: originalError?.message });
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ServiceBusError extends BaseError {
  constructor(message: string, originalError?: Error) {
    super(message, 503, true, { originalError: originalError?.message });
    Object.setPrototypeOf(this, ServiceBusError.prototype);
  }
}

// Error factory functions
export const createValidationError = (field: string, value: any, message?: string): ValidationError => {
  const defaultMessage = `Invalid value for field '${field}': ${value}`;
  return new ValidationError(message || defaultMessage, { field, value });
};

export const createNotFoundError = (resource: string, id: string): NotFoundError => {
  return new NotFoundError(`${resource} with ID '${id}' not found`);
};

export const createConflictError = (resource: string, field: string, value: any): ConflictError => {
  return new ConflictError(`${resource} with ${field} '${value}' already exists`);
};

// Error type guards
export const isOperationalError = (error: Error): error is BaseError => {
  return error instanceof BaseError && error.isOperational;
};

export const isDatabaseError = (error: Error): boolean => {
  return error.name === 'ConnectionError' || 
         error.name === 'RequestError' ||
         error.message.includes('database') ||
         error.message.includes('SQL');
};

export const isValidationError = (error: Error): boolean => {
  return error.name === 'ValidationError' || error instanceof ValidationError;
};

export const isAuthError = (error: Error): boolean => {
  return error.name === 'JsonWebTokenError' ||
         error.name === 'TokenExpiredError' ||
         error.name === 'NotBeforeError' ||
         error instanceof UnauthorizedError;
};