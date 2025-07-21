// src/middleware/errorHandler.ts
// Error handling middleware

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ValidationError, NotFoundError, BadRequestError } from '../utils/errors';

interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  path: string;
  requestId?: string;
  details?: any;
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl;
  const requestId = req.headers['x-request-id'] as string;

  // Log the error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    path,
    method: req.method,
    requestId,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  // Build base error response
  const errorResponse: ErrorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp,
    path,
    requestId,
  };

  // Handle specific error types
  if (error instanceof ValidationError) {
    errorResponse.error = 'Validation Error';
    errorResponse.message = error.message;
    errorResponse.details = error.details;
    res.status(400).json(errorResponse);
    return;
  }

  if (error instanceof BadRequestError) {
    errorResponse.error = 'Bad Request';
    errorResponse.message = error.message;
    res.status(400).json(errorResponse);
    return;
  }

  if (error instanceof NotFoundError) {
    errorResponse.error = 'Not Found';
    errorResponse.message = error.message;
    res.status(404).json(errorResponse);
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    errorResponse.error = 'Unauthorized';
    errorResponse.message = 'Invalid token';
    res.status(401).json(errorResponse);
    return;
  }

  if (error.name === 'TokenExpiredError') {
    errorResponse.error = 'Unauthorized';
    errorResponse.message = 'Token expired';
    res.status(401).json(errorResponse);
    return;
  }

  // Handle SQL Server errors
  if (error.name === 'ConnectionError') {
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'Database connection failed';
    res.status(503).json(errorResponse);
    return;
  }

  if (error.message && error.message.includes('UNIQUE KEY constraint')) {
    errorResponse.error = 'Conflict';
    errorResponse.message = 'Resource already exists';
    res.status(409).json(errorResponse);
    return;
  }

  // Handle Service Bus errors
  if (error.name === 'ServiceBusError') {
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'Message service temporarily unavailable';
    res.status(503).json(errorResponse);
    return;
  }

  // Handle Joi validation errors
  if (error.name === 'ValidationError' && 'details' in error) {
    errorResponse.error = 'Validation Error';
    errorResponse.message = 'Invalid request data';
    errorResponse.details = (error as any).details.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    res.status(400).json(errorResponse);
    return;
  }

  // Handle Azure errors
  if (error.name === 'RestError' || error.message?.includes('Azure')) {
    errorResponse.error = 'Service Unavailable';
    errorResponse.message = 'External service temporarily unavailable';
    res.status(503).json(errorResponse);
    return;
  }

  // Handle generic HTTP errors
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode;
    if (statusCode >= 400 && statusCode < 500) {
      errorResponse.error = 'Client Error';
      errorResponse.message = error.message || 'Bad request';
      res.status(statusCode).json(errorResponse);
      return;
    }
  }

  // Default to 500 Internal Server Error
  // In production, don't expose the actual error message
  if (process.env.NODE_ENV === 'production') {
    errorResponse.message = 'An unexpected error occurred';
    delete errorResponse.details;
  } else {
    errorResponse.message = error.message;
    errorResponse.details = {
      stack: error.stack,
      name: error.name,
    };
  }

  res.status(500).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ErrorResponse = {
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };

  res.status(404).json(errorResponse);
};