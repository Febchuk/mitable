import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { swaggerSpec } from "./swagger.js";
import { config } from "./config.js";
import { generalLimiter } from "./middleware/rateLimiter.js";

export const app = express();

// Trust proxy - Required for Railway/Heroku and other reverse proxies
// This allows express-rate-limit to correctly identify client IPs via X-Forwarded-For
app.set('trust proxy', 1);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin header (Electron, mobile apps, curl, etc.)
      // This is safe because we still require authentication (JWT tokens)
      if (!origin) {
        return callback(null, true);
      }

      // Validate origin header if present (web browsers)
      if (config.cors.allowedOrigins.includes(origin)) {
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

app.use(express.json({ limit: "10mb" })); // Increased limit for screenshot uploads (~2MB base64)

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

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes with rate limiting
app.use("/api", generalLimiter, router);
