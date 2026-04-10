import { describe, it, expect } from "@jest/globals";
import type { VectorMetadata, VectorRecord, QueryResult } from "./vector.service.js";

/**
 * Simple unit tests for VectorService
 * Focus on type exports and interface structure
 */
describe("VectorService", () => {
  describe("interface exports", () => {
    it("should have VectorMetadata with required text field", () => {
      const metadata: VectorMetadata = {
        text: "test",
      };
      expect(metadata.text).toBe("test");
    });

    it("should have VectorMetadata with optional fields", () => {
      const metadata: VectorMetadata = {
        text: "test",
        source: "test-source",
        timestamp: Date.now(),
      };
      expect(metadata.source).toBe("test-source");
      expect(metadata.timestamp).toBeDefined();
    });

    it("should have VectorRecord interface with id, values, and metadata", () => {
      const record: VectorRecord = {
        id: "test-1",
        values: [0.1, 0.2, 0.3],
        metadata: { text: "test" },
      };
      expect(record.id).toBe("test-1");
      expect(record.values).toHaveLength(3);
      expect(record.metadata.text).toBe("test");
    });

    it("should have QueryResult interface with id, score, and metadata", () => {
      const result: QueryResult = {
        id: "result-1",
        score: 0.95,
        metadata: { text: "test result" },
      };
      expect(result.id).toBe("result-1");
      expect(result.score).toBe(0.95);
      expect(result.metadata.text).toBe("test result");
    });
  });

  describe("VectorRecord structure", () => {
    it("should accept 1536-dimensional vectors", () => {
      const vector: VectorRecord = {
        id: "test",
        values: Array(1536).fill(0.1),
        metadata: { text: "test" },
      };
      expect(vector.values).toHaveLength(1536);
    });

    it("should accept metadata with custom fields", () => {
      const vector: VectorRecord = {
        id: "test",
        values: [0.1],
        metadata: {
          text: "test",
          customField: "custom value",
          numericField: 123,
        },
      };
      expect(vector.metadata.customField).toBe("custom value");
      expect(vector.metadata.numericField).toBe(123);
    });
  });
});
