import { describe, it, expect } from "@jest/globals";
import { extractNotionPageId } from "./notion-url-parser.js";

describe("extractNotionPageId", () => {
  const validPageId = "1429989fe8ac4effbc8f57f56486db54";

  describe("valid inputs", () => {
    it("should extract page ID from standard Notion URL", () => {
      const url = `https://notion.so/My-Page-${validPageId}`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should extract page ID from URL with workspace", () => {
      const url = `https://notion.so/workspace/Engineering-Docs-${validPageId}`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should extract page ID from www.notion.so URL", () => {
      const url = `https://www.notion.so/My-Page-${validPageId}`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should extract page ID from URL with query parameters", () => {
      const url = `https://notion.so/My-Page-${validPageId}?pvs=4`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should extract page ID from URL with multiple query parameters", () => {
      const url = `https://notion.so/Page-${validPageId}?pvs=4&edit=true`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should handle direct page ID input", () => {
      expect(extractNotionPageId(validPageId)).toBe(validPageId);
    });

    it("should handle page ID with hyphens (UUID format)", () => {
      // UUID format with hyphens (36 chars): 14299-89fe8a-c4eff-bc8f-57f56486db54
      const idWithHyphens = "1429989f-e8ac-4eff-bc8f-57f56486db54";
      const expectedId = idWithHyphens.replace(/-/g, "");
      expect(extractNotionPageId(idWithHyphens)).toBe(expectedId);
    });

    it("should handle URL with trailing slash", () => {
      const url = `https://notion.so/My-Page-${validPageId}/`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should handle mixed case page IDs", () => {
      const mixedCaseId = "1429989FE8AC4EFFBC8F57F56486DB54";
      expect(extractNotionPageId(mixedCaseId)).toBe(mixedCaseId);
    });
  });

  describe("invalid inputs", () => {
    it("should throw error for empty string", () => {
      expect(() => extractNotionPageId("")).toThrow("Notion URL or page ID is required");
    });

    it("should throw error for null/undefined", () => {
      expect(() => extractNotionPageId(null as any)).toThrow("Notion URL or page ID is required");
      expect(() => extractNotionPageId(undefined as any)).toThrow(
        "Notion URL or page ID is required"
      );
    });

    it("should throw error for non-Notion URL", () => {
      expect(() => extractNotionPageId("https://google.com")).toThrow("Invalid Notion URL");
    });

    it("should throw error for invalid Notion URL format", () => {
      expect(() => extractNotionPageId("https://notion.so/")).toThrow(
        "Could not find a valid page ID"
      );
    });

    it("should throw error for Notion URL without page ID", () => {
      expect(() => extractNotionPageId("https://notion.so/workspace/")).toThrow(
        "Could not find a valid page ID"
      );
    });

    it("should throw error for page ID that is too short", () => {
      expect(() => extractNotionPageId("https://notion.so/Page-abc123")).toThrow(
        "Could not find a valid page ID"
      );
    });

    it("should throw error for page ID with invalid characters", () => {
      expect(() =>
        extractNotionPageId("https://notion.so/Page-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")
      ).toThrow("Could not find a valid page ID");
    });

    it("should throw error for direct ID that is too short", () => {
      expect(() => extractNotionPageId("abc123")).toThrow("Invalid Notion URL");
    });
  });

  describe("edge cases", () => {
    it("should handle URL with extra whitespace", () => {
      const url = `  https://notion.so/My-Page-${validPageId}  `;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should handle URL with special characters in title", () => {
      const url = `https://notion.so/My-Page-Title-2024-${validPageId}`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });

    it("should handle URL with underscores in title", () => {
      const url = `https://notion.so/My_Page_Title-${validPageId}`;
      expect(extractNotionPageId(url)).toBe(validPageId);
    });
  });
});
