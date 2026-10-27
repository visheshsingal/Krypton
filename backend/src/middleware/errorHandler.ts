import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error(`[Server Error] ${err.name || 'Error'}: ${err.message}`, err.stack);

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    res.status(409).json({
      error: `A resource with this ${field} already exists.`,
    });
    return;
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({
      error: `Invalid identifier format: ${err.value}`,
    });
    return;
  }

  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);

  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(config.nodeEnv === 'development' ? { stack: err.stack } : {}),
  });
}
