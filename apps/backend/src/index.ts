import { app } from "./app.js";
import { config, validateConfig, checkPortAvailability } from "./config.js";
import { testConnection } from "./db/client.js";
import { vectorService } from "./services/vector.service.js";
import { piiRedactionService } from "./services/pii-redaction.service.js";

async function startServer() {
  // Validate environment variables
  console.log("🔍 Validating configuration...");
  const isValid = validateConfig();

  if (!isValid) {
    console.error("❌ Configuration validation failed. Please check your .env file.");
    if (config.nodeEnv !== "production") {
      console.warn("⚠️  Continuing in development mode with warnings...");
    } else {
      process.exit(1);
    }
  }

  // Check if port is available
  console.log(`🔍 Checking port ${config.port} availability...`);
  const portAvailable = await checkPortAvailability(config.port);

  if (!portAvailable) {
    console.error(
      `❌ Port ${config.port} is already in use. ` +
        `Please try a different port using --backend-port flag or PORT environment variable.\n` +
        `Example: npm run dev -- --backend-port=${config.port + 1}`
    );
    process.exit(1);
  }

  // Test database connection
  console.log("🔌 Testing database connection...");
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.error("❌ Failed to connect to database");
    if (config.nodeEnv === "production") {
      process.exit(1);
    }
  }

  // Initialize vector service
  console.log("🔧 Initializing vector service...");
  vectorService.initialize();
  console.log("✅ Vector service initialized");

  // Initialize PII redaction service (warm up 5 OCR workers for parallel processing)
  console.log("🔧 Initializing PII redaction service...");
  await piiRedactionService.initializeOCRWorkers();
  console.log("✅ PII redaction service hot and ready (5 workers)");

  // Start server
  app.listen(config.port, () => {
    console.log(`🚀 Mitable Backend API running on http://localhost:${config.port}`);
    console.log(`📊 Environment: ${config.nodeEnv}`);
  });
}

startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
