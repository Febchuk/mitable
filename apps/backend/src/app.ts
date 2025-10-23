import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import { swaggerSpec } from "./swagger.js";

export const app = express();

// Middleware
app.use(cors());
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
