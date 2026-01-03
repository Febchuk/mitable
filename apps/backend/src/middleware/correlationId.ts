import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Middleware that generates or propagates correlation IDs for request tracing.
 * The correlation ID is attached to the request object and echoed in the response.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Use incoming correlation ID or generate new one
  const correlationId =
    (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID();

  // Attach to request for use in handlers
  req.correlationId = correlationId;

  // Echo back in response headers
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
}
