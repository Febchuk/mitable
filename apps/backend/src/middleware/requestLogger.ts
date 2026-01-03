import pinoHttp from "pino-http";
import { logger } from "../lib/logger";
import { Request, Response } from "express";

/**
 * HTTP request logging middleware using pino-http.
 * Automatically logs all requests with correlation IDs and user context.
 */
export const requestLoggerMiddleware = pinoHttp({
  logger,

  // Attach correlation ID and user context to all logs
  customProps: (req: Request) => ({
    correlationId: req.correlationId,
    userId: req.userId || "anonymous",
    organizationId: req.organizationId || null,
  }),

  // Set log level based on response status
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  // Skip health checks to reduce noise
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },

  // Custom success message
  customSuccessMessage: (req: Request, _res: Response) => {
    return `${req.method} ${req.url} completed`;
  },

  // Custom error message
  customErrorMessage: (req: Request, _res: Response, err: Error) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },

  // Redact sensitive request data
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      // Omit body to prevent logging screenshots and sensitive data
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
