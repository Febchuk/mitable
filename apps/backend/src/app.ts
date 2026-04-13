import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { swaggerSpec } from "./swagger.js";
import { config } from "./config.js";
import { generalLimiter } from "./domains/auth/middleware/rateLimiter.js";
import { correlationIdMiddleware } from "./domains/shared-infra/middleware/correlationId.js";
import { requestLoggerMiddleware } from "./domains/shared-infra/middleware/requestLogger.js";
import { errorHandler } from "./domains/shared-infra/middleware/errorHandler.js";
import { setupSentryErrorHandler } from "./domains/shared-infra/lib/sentry.js";
import { mcpRouter } from "./domains/shared-infra/mcp/transport.js";

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

// Default limit covers standard API payloads. Routes that receive batch screenshot
// uploads (e.g. POST /api/monitoring/sessions/:id/captures) apply their own
// route-level parser with a higher limit.
app.use(express.json({ limit: "10mb" }));

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

// mcp-remote probes OAuth endpoints before connecting. The well-known discovery
// endpoint is left unhandled (Express default HTML 404) — mcp-remote correctly
// ignores HTML 404 and skips OAuth. But if it does attempt client registration,
// POST /register must return JSON (not HTML) to avoid a parse crash.
app.post("/register", (_req, res) => {
  res.status(404).json({ error: "OAuth client registration not supported" });
});
app.post("/mcp/register", (_req, res) => {
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
