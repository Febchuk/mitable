import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { swaggerSpec } from "./swagger.js";
import { config } from "./config.js";

export const app = express();

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // In development, allow requests with no origin (like curl, Postman, etc.)
      // In production, require origin header for security
      if (!origin) {
        if (config.nodeEnv === "development") {
          return callback(null, true);
        } else {
          return callback(new Error("Origin header required"));
        }
      }

      if (config.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
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

// API routes
app.use("/api", router);
