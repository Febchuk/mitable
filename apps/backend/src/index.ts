import { app } from "./app.js";
import { config, validateConfig } from "./config.js";
import { testConnection } from "./db/client.js";
import { vectorService } from "./services/vector.service.js";

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
