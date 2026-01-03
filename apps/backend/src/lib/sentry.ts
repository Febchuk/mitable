import * as Sentry from "@sentry/node";
import type { Express } from "express";
import { logger } from "./logger";

let sentryInitialized = false;

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    logger.warn("Sentry DSN not configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: `mitable-backend@${process.env.npm_package_version || "0.1.0"}`,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Filter out expected errors
    beforeSend(event) {
      // Don't send rate limit errors
      if (event.exception?.values?.[0]?.type === "RateLimitError") {
        return null;
      }
      return event;
    },
  });

  sentryInitialized = true;
  logger.info("Sentry error tracking initialized");
}

/**
 * Setup Sentry error handler for Express (Sentry v8+ API)
 */
export function setupSentryErrorHandler(app: Express) {
  if (sentryInitialized) {
    Sentry.setupExpressErrorHandler(app);
  }
}

export { Sentry };
