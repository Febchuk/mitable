import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../lib/logger";

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handler middleware.
 * Logs errors, sends to Sentry for 5xx errors, and returns consistent error responses.
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const correlationId = req.correlationId || "unknown";
  const statusCode = err.statusCode || 500;

  // Create child logger with request context
  const reqLogger = logger.child({
    correlationId,
    userId: req.userId,
    path: req.path,
    method: req.method,
  });

  // Log error with full context
  reqLogger.error(
    {
      err,
      statusCode,
      stack: err.stack,
    },
    `Request failed: ${err.message}`
  );

  // Send to Sentry for 5xx errors
  if (statusCode >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag("correlationId", correlationId);
      scope.setUser({ id: req.userId || "anonymous" });
      scope.setContext("request", {
        method: req.method,
        url: req.url,
        query: req.query,
      });
      Sentry.captureException(err);
    });
  }

  // Send error response
  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal Server Error" : err.message,
    message: err.message,
    correlationId,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}
