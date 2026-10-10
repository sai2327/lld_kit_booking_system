import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class BookingConflictError extends AppError {
  constructor(message = 'Booking slot conflicts with an existing reservation or 15-minute buffer') {
    super(message, 409);
    this.name = 'BookingConflictError';
  }
}

export class KitNotReadyError extends AppError {
  constructor(message = 'Kit is incomplete, damaged, or uninspected') {
    super(message, 422);
    this.name = 'KitNotReadyError';
  }
}

export class InvalidStateError extends AppError {
  constructor(message = 'Operation is not permitted in the current state') {
    super(message, 409);
    this.name = 'InvalidStateError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict: resource already exists') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.name,
      details: err.details,
    });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
