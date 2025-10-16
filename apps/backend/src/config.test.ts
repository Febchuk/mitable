import { describe, it, expect } from "@jest/globals";

/**
 * Simple unit tests for Config
 * Focus on validation logic without requiring actual env vars
 */
describe("Config", () => {
  describe("vectorDimensions", () => {
    it("should have vectorDimensions set to 1536", async () => {
      // Import dynamically to avoid issues with env vars
      const { config } = await import("./config.js");
      expect(config.vectorDimensions).toBe(1536);
    });
  });

  describe("openai configuration", () => {
    it("should have text-embedding-3-small as default model", async () => {
      const { config } = await import("./config.js");
      expect(config.openai.embeddingModel).toBe("text-embedding-3-small");
    });
  });

  describe("validateVectorDimensions", () => {
    it("should accept 1536 dimensions (matches config)", async () => {
      const { validateVectorDimensions } = await import("./config.js");
      expect(() => validateVectorDimensions(1536)).not.toThrow();
    });

    it("should reject mismatched dimensions", async () => {
      const { validateVectorDimensions } = await import("./config.js");
      expect(() => validateVectorDimensions(3072)).toThrow("dimension mismatch");
    });

    it("should include model name in error message", async () => {
      const { validateVectorDimensions } = await import("./config.js");
      try {
        validateVectorDimensions(3072);
        fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toContain("text-embedding-3-small");
        expect(error.message).toContain("3072D");
        expect(error.message).toContain("1536D");
      }
    });
  });
});
