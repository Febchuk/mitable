// Mock Supabase client before any imports
jest.mock("./lib/supabase.js");

import request from "supertest";
import { app } from "./app.js";

describe("Backend API Routes", () => {
  describe("GET /", () => {
    it("should return API information", async () => {
      const response = await request(app).get("/");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("service", "Mitable API");
      expect(response.body).toHaveProperty("version");
      expect(response.body).toHaveProperty("status", "running");
      expect(response.body).toHaveProperty("environment");
      expect(response.body).toHaveProperty("endpoints");
      expect(response.body).toHaveProperty("links");
    });
  });

  describe("GET /health", () => {
    it("should return 200 with enhanced health info", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("service", "Mitable Backend API");
      expect(response.body).toHaveProperty("environment");
      expect(response.body).toHaveProperty("version");
    });
  });

  describe("GET /api/conversations", () => {
    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/conversations");

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error", "Unauthorized");
    });
  });

  describe("GET /api/roadmaps", () => {
    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/roadmaps");

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error", "Unauthorized");
    });
  });

  describe("GET /api/nudges", () => {
    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/nudges");

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error", "Unauthorized");
    });
  });

  describe("POST /api/help", () => {
    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .post("/api/help")
        .send({ question: "How do I escalate a ticket?" });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error", "Unauthorized");
    });
  });

  describe("GET /api/nonexistent", () => {
    it("should return 404 for non-existent routes", async () => {
      const response = await request(app).get("/api/nonexistent");

      expect(response.status).toBe(404);
    });
  });
});
