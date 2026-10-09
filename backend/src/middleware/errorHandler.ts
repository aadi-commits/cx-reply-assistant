import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../modules/ai/ai.service';
import { ExternalServiceError } from '../utils/http';

/**
 * Centralised error handling. Maps known error types to status codes and
 * safe messages. Never leaks stack traces or provider internals to clients.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error instanceof ExternalServiceError) {
    // Upstream AI/embedding failure or timeout — transient, retryable.
    console.error('External service error:', error.message);
    return res.status(502).json({ error: error.message, transient: true });
  }

  console.error('Unhandled error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
