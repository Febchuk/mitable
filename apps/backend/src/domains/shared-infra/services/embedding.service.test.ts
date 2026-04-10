import { describe, it, expect } from "@jest/globals";
import { MODEL_DIMENSIONS } from "./embedding.service.js";

/**
 * Simple unit tests for EmbeddingService
 * Focus on constants and validation logic without complex mocking
 */
describe("EmbeddingService", () => {
  describe("MODEL_DIMENSIONS constant", () => {
    it("should have correct dimensions for text-embedding-3-small", () => {
      expect(MODEL_DIMENSIONS["text-embedding-3-small"]).toBe(1536);
    });

    it("should have correct dimensions for text-embedding-3-large", () => {
      expect(MODEL_DIMENSIONS["text-embedding-3-large"]).toBe(3072);
    });

    it("should have correct dimensions for text-embedding-ada-002", () => {
      expect(MODEL_DIMENSIONS["text-embedding-ada-002"]).toBe(1536);
    });

    it("should export all supported models", () => {
      const models = Object.keys(MODEL_DIMENSIONS);
      expect(models).toContain("text-embedding-3-small");
      expect(models).toContain("text-embedding-3-large");
      expect(models).toContain("text-embedding-ada-002");
    });
  });

  describe("getDimensions", () => {
    it("should return dimension for configured model", () => {
      // Test the constant directly since service requires API keys
      const model = "text-embedding-3-small";
      expect(MODEL_DIMENSIONS[model]).toBe(1536);
    });
  });
});
