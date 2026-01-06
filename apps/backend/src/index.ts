// Initialize observability FIRST (before any other imports that might throw)
import { initSentry } from "./lib/sentry.js";
import { initAnalytics, analytics } from "./lib/analytics.js";
import { logger } from "./lib/logger.js";

initSentry();
initAnalytics();

import { app } from "./app.js";
import { config, validateConfig, checkPortAvailability } from "./config.js";
import { testConnection } from "./db/client.js";
import { vectorService } from "./services/vector.service.js";
import { piiRedactionService } from "./services/pii-redaction.service.js";

async function startServer() {
  // Validate environment variables
  logger.info("Validating configuration...");
  const isValid = validateConfig();

  if (!isValid) {
    logger.error("Configuration validation failed. Please check your .env file.");
    if (config.nodeEnv !== "production") {
      logger.warn("Continuing in development mode with warnings...");
    } else {
      process.exit(1);
    }
  }

  // Check if port is available
  logger.info({ port: config.port }, "Checking port availability...");
  const portAvailable = await checkPortAvailability(config.port);

  if (!portAvailable) {
    logger.error(
      { port: config.port },
      `Port ${config.port} is already in use. ` +
        `Please try a different port using --backend-port flag or PORT environment variable.`
    );
    process.exit(1);
  }

  // Test database connection
  logger.info("Testing database connection...");
  const dbConnected = await testConnection();

  if (!dbConnected) {
    logger.error("Failed to connect to database");
    if (config.nodeEnv === "production") {
      process.exit(1);
    }
  }

  // Initialize vector service
  logger.info("Initializing vector service...");
  vectorService.initialize();
  logger.info("Vector service initialized");

  // Initialize PII redaction service (warm up 5 OCR workers for parallel processing)
  logger.info("Initializing PII redaction service...");
  await piiRedactionService.initializeOCRWorkers();
  logger.info("PII redaction service ready (5 workers)");

  // Start server
  app.listen(config.port, () => {
    logger.info(
      { port: config.port, environment: config.nodeEnv },
      `Mitable Backend API running on http://localhost:${config.port}`
    );
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  await analytics.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully...");
  await analytics.shutdown();
  process.exit(0);
});

startServer().catch((error) => {
  logger.error({ err: error }, "Failed to start server");
  process.exit(1);
});
// Railway deploy trigger Mon Jan  5 18:02:04 PST 2026
