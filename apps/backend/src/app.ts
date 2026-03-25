import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { swaggerSpec } from "./swagger.js";
import { config } from "./config.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { setupSentryErrorHandler } from "./lib/sentry.js";
import { mcpRouter } from "./mcp/transport.js";

export const app = express();

// Trust proxy - Required for Railway/Heroku and other reverse proxies
// This allows express-rate-limit to correctly identify client IPs via X-Forwarded-For
app.set("trust proxy", 1);

// =============================================================================
// OBSERVABILITY MIDDLEWARE (order matters!)
// =============================================================================

// 1. Correlation ID - generates/propagates request IDs for tracing
app.use(correlationIdMiddleware);

// 2. Request logger - logs all HTTP requests with correlation IDs
app.use(requestLoggerMiddleware);

// =============================================================================
// SECURITY & PARSING MIDDLEWARE
// =============================================================================

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin header (Electron, mobile apps, curl, etc.)
      // This is safe because we still require authentication (JWT tokens)
      if (!origin) {
        return callback(null, true);
      }

      // Validate origin header if present (web browsers)
      const isAllowed =
        config.cors.allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".mitable.ai") ||
        origin === "https://mitable.ai" ||
        origin === "https://www.mitable.ai";

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for API (not needed)
    crossOriginEmbedderPolicy: false, // Allow embedding for Swagger docs
  })
);

// Stripe webhooks require the raw body for signature verification — must come BEFORE json parser
app.use("/api/stripe/webhooks", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "100mb" })); // Large limit for batch screenshot uploads (16+ captures with base64 images)

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Mitable API Documentation",
  })
);

// Serve OpenAPI spec as JSON
app.get("/api-docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Root endpoint - API information
app.get("/", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    service: "Mitable API",
    version: "0.1.0",
    status: "running",
    environment: config.nodeEnv,
    endpoints: {
      health: "/health",
      apiDocs: "/api-docs",
      apiDocsJson: "/api-docs.json",
      api: "/api/*",
      mcp: "/mcp",
    },
    links: {
      health: `${baseUrl}/health`,
      docs: `${baseUrl}/api-docs`,
      repository: "https://github.com/Febchuk/mitable",
    },
  });
});

// Health check - Enhanced with environment info
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Mitable Backend API",
    environment: config.nodeEnv,
    version: "0.1.0",
  });
});

// MCP endpoint — no rate limiter (API key auth handles access control)
app.use("/mcp", mcpRouter);

// OAuth discovery endpoints — mcp-remote 0.1.38+ probes these before connecting.
// Return JSON 404s so it gracefully skips OAuth and uses the Bearer token header.
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.status(404).json({ error: "OAuth not supported" });
});
app.post("/register", (_req, res) => {
  res.status(404).json({ error: "OAuth client registration not supported" });
});

// API routes with rate limiting
app.use("/api", generalLimiter, router);

// =============================================================================
// ERROR HANDLING MIDDLEWARE (must be last)
// =============================================================================

// Sentry error handler - captures errors for tracking (Sentry v8+ API)
setupSentryErrorHandler(app);

// Custom error handler - formats error responses
app.use(errorHandler);
