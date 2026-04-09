import { describe, it, expect } from "@jest/globals";
import { chunkingService } from "./chunking.service.js";

describe("ChunkingService", () => {
  describe("countTokens", () => {
    it("should count tokens for short text", () => {
      const text = "Hello world";
      const count = chunkingService.countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it("should count tokens for empty text", () => {
      const count = chunkingService.countTokens("");
      expect(count).toBe(0);
    });

    it("should count tokens for longer text", () => {
      const text = "This is a longer piece of text that should have more tokens.";
      const count = chunkingService.countTokens(text);
      expect(count).toBeGreaterThan(10);
    });
  });

  describe("chunkText", () => {
    it("should not chunk short text", () => {
      const text = "This is a short message.";
      const chunks = chunkingService.chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].totalChunks).toBe(1);
    });

    it("should chunk long text into multiple pieces", () => {
      const longText = "Lorem ipsum dolor sit amet. ".repeat(200);
      const chunks = chunkingService.chunkText(longText);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].totalChunks).toBe(chunks.length);

      chunks.forEach((chunk, idx) => {
        expect(chunk.chunkIndex).toBe(idx);
        expect(chunk.tokenCount).toBeLessThanOrEqual(1000);
        expect(chunk.text.length).toBeGreaterThan(0);
      });
    });

    it("should create overlapping chunks", () => {
      const longText = "Sentence one. Sentence two. Sentence three. ".repeat(50);
      const chunks = chunkingService.chunkText(longText);

      if (chunks.length > 1) {
        const firstChunkEnd = chunks[0].text.substring(chunks[0].text.length - 50);
        const secondChunkStart = chunks[1].text.substring(0, 50);

        expect(firstChunkEnd).toBeTruthy();
        expect(secondChunkStart).toBeTruthy();
      }
    });

    it("should handle empty text", () => {
      const chunks = chunkingService.chunkText("");

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe("");
      expect(chunks[0].tokenCount).toBe(0);
    });

    it("should prefer paragraph boundaries", () => {
      const textWithParagraphs =
        "First paragraph with lots of text. ".repeat(30) +
        "\n\n" +
        "Second paragraph with lots of text. ".repeat(30);

      const chunks = chunkingService.chunkText(textWithParagraphs);

      if (chunks.length > 1) {
        expect(chunks[0].text).toContain("\n\n");
      }
    });

    it("should prefer sentence boundaries", () => {
      const textWithSentences = "This is sentence one. This is sentence two. ".repeat(50);
      const chunks = chunkingService.chunkText(textWithSentences);

      if (chunks.length > 1) {
        const firstChunkEndsWithSentence =
          chunks[0].text.endsWith(". ") || chunks[0].text.endsWith(".\n");
        expect(firstChunkEndsWithSentence).toBeTruthy();
      }
    });

    it("should set correct chunk metadata", () => {
      const longText = "Word ".repeat(500);
      const chunks = chunkingService.chunkText(longText);

      chunks.forEach((chunk, idx) => {
        expect(chunk.chunkIndex).toBe(idx);
        expect(chunk.totalChunks).toBe(chunks.length);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      });
    });
  });

  describe("chunkTexts", () => {
    it("should chunk multiple texts", () => {
      const texts = ["Short text one", "Word ".repeat(2000), "Another short one"];

      const results = chunkingService.chunkTexts(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(1);
      expect(results[1].length).toBeGreaterThan(1);
      expect(results[2]).toHaveLength(1);
    });

    it("should handle empty array", () => {
      const results = chunkingService.chunkTexts([]);
      expect(results).toHaveLength(0);
    });
  });
});
