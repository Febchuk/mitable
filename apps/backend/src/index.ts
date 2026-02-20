// Initialize observability FIRST (before any other imports that might throw)
import { initSentry } from "./lib/sentry.js";
import { initAnalytics, analytics } from "./lib/analytics.js";
import { logger } from "./lib/logger.js";

initSentry();
initAnalytics();

import { createServer } from "http";
import { app } from "./app.js";
import { config, validateConfig, checkPortAvailability } from "./config.js";
import { testConnection } from "./db/client.js";
import { vectorService } from "./services/vector.service.js";
import { piiRedactionService } from "./services/pii-redaction.service.js";
import { socketService } from "./services/socket.service.js";
import { setupWorkstreamSocketEmitter } from "./services/workstream-socket-emitter.js";
import { db } from "./db/client.js";
import * as schema from "./db/schema/index.js";
import { isNotNull, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { initializeAudioWebSocket } from "./routes/audio.js";
import { initCronJobs } from "./cron/index.js";

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

  // Create HTTP server and initialize Socket.IO
  const httpServer = createServer(app);
  socketService.initialize(httpServer);

  // Initialize audio WebSocket for Deepgram transcription
  initializeAudioWebSocket(httpServer);

  // Set up workstream event emitter to broadcast via WebSocket
  setupWorkstreamSocketEmitter();

  // Initialize cron jobs for admin dashboard data pipeline
  initCronJobs();

  // Startup cleanup: clear stale imageData from sessions that ended >1 hour ago
  // This catches any images missed due to server restarts (replaces fragile setTimeout)
  cleanupStaleImageData().catch((err) =>
    logger.warn({ err }, "Startup imageData cleanup failed (non-fatal)")
  );

  // Periodic cleanup every 30 minutes
  setInterval(
    () => {
      cleanupStaleImageData().catch((err) =>
        logger.warn({ err }, "Periodic imageData cleanup failed (non-fatal)")
      );
    },
    30 * 60 * 1000
  );

  // Start server
  httpServer.listen(config.port, () => {
    logger.info(
      { port: config.port, environment: config.nodeEnv },
      `Mitable Backend API running on http://localhost:${config.port}`
    );
    logger.info("WebSocket server ready for real-time workstream updates");
  });
}

/**
 * Clear imageData from session captures where session ended > 1 hour ago.
 * Runs on startup and every 30 minutes to catch images missed by in-memory setTimeout.
 */
async function cleanupStaleImageData() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  await db
    .update(schema.sessionCaptures)
    .set({ imageData: null })
    .where(
      and(
        isNotNull(schema.sessionCaptures.imageData),
        sql`${schema.sessionCaptures.sessionId} IN (
          SELECT id FROM monitoring_sessions
          WHERE ended_at IS NOT NULL AND ended_at < ${oneHourAgo}
        )`
      )
    );

  logger.info("Stale imageData cleanup completed");
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
