import request from "supertest";
import { app } from "./app.js";

describe("Backend API Routes", () => {
  describe("GET /health", () => {
    it("should return 200 with status ok", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
    });
  });

  describe("GET /api/conversations", () => {
    it("should return empty array", async () => {
      const response = await request(app).get("/api/conversations");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ conversations: [] });
    });
  });

  describe("GET /api/roadmaps", () => {
    it("should return empty array", async () => {
      const response = await request(app).get("/api/roadmaps");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ roadmaps: [] });
    });
  });

  describe("GET /api/nudges", () => {
    it("should return empty array", async () => {
      const response = await request(app).get("/api/nudges");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ nudges: [] });
    });
  });

  describe("POST /api/help", () => {
    it("should return placeholder message", async () => {
      const response = await request(app)
        .post("/api/help")
        .send({ question: "How do I escalate a ticket?" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: "Help endpoint - to be implemented",
      });
    });
  });

  describe("GET /api/nonexistent", () => {
    it("should return 404 for non-existent routes", async () => {
      const response = await request(app).get("/api/nonexistent");

      expect(response.status).toBe(404);
    });
  });
});
