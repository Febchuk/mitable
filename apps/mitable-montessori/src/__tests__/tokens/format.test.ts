import { describe, it, expect } from "vitest";
import {
  formatStudentToken,
  formatSubtopicToken,
  formatClassroomToken,
  formatToken,
  parseToken,
  extractTokens,
  isToken,
  TOKEN_RE,
} from "@/lib/tokens/format";

const UUID_A = "7e1c8a3b-2f4d-4d6c-9a3e-12abcd34ef56";
const UUID_B = "11111111-2222-3333-4444-555555555555";

describe("token format", () => {
  describe("formatters", () => {
    it("formats student tokens", () => {
      expect(formatStudentToken(UUID_A)).toBe(`{{student:${UUID_A}}}`);
    });

    it("formats subtopic tokens", () => {
      expect(formatSubtopicToken(UUID_A)).toBe(`{{subtopic:${UUID_A}}}`);
    });

    it("formats classroom tokens", () => {
      expect(formatClassroomToken(UUID_A)).toBe(`{{classroom:${UUID_A}}}`);
    });

    it("formats arbitrary kinds via formatToken", () => {
      expect(formatToken("guardian", UUID_A)).toBe(`{{guardian:${UUID_A}}}`);
    });
  });

  describe("parseToken", () => {
    it("parses a valid student token", () => {
      const parsed = parseToken(`{{student:${UUID_A}}}`);
      expect(parsed).toEqual({
        kind: "student",
        id: UUID_A,
        raw: `{{student:${UUID_A}}}`,
      });
    });

    it("returns null for non-tokens", () => {
      expect(parseToken("hello")).toBeNull();
      expect(parseToken("[STUDENT_1]")).toBeNull();
      expect(parseToken("{{student:not-a-uuid}}")).toBeNull();
    });

    it("returns null for tokens with surrounding text", () => {
      // parseToken expects a single token only — extractTokens is for embedded matches.
      expect(parseToken(`hello {{student:${UUID_A}}}`)).toBeNull();
    });

    it("normalizes kind and id to lowercase", () => {
      const parsed = parseToken(`{{STUDENT:${UUID_A.toUpperCase()}}}`);
      expect(parsed?.kind).toBe("student");
      expect(parsed?.id).toBe(UUID_A);
    });
  });

  describe("extractTokens", () => {
    it("returns tokens in order of appearance", () => {
      const text = `{{student:${UUID_A}}} likes {{subtopic:${UUID_B}}}.`;
      const tokens = extractTokens(text);
      expect(tokens).toHaveLength(2);
      expect(tokens[0].kind).toBe("student");
      expect(tokens[0].id).toBe(UUID_A);
      expect(tokens[1].kind).toBe("subtopic");
      expect(tokens[1].id).toBe(UUID_B);
    });

    it("returns empty array when no tokens present", () => {
      expect(extractTokens("plain prose")).toEqual([]);
    });

    it("handles repeated tokens", () => {
      const text = `{{student:${UUID_A}}} and {{student:${UUID_A}}}`;
      expect(extractTokens(text)).toHaveLength(2);
    });
  });

  describe("isToken", () => {
    it("returns true for a single token", () => {
      expect(isToken(`{{student:${UUID_A}}}`)).toBe(true);
    });

    it("returns false for embedded tokens", () => {
      expect(isToken(`{{student:${UUID_A}}} hi`)).toBe(false);
    });
  });

  describe("TOKEN_RE round-trip", () => {
    it("a freshly-constructed RegExp from TOKEN_RE.source matches every token", () => {
      const re = new RegExp(TOKEN_RE.source, "g");
      const text = `${formatStudentToken(UUID_A)} and ${formatClassroomToken(UUID_B)}`;
      const matches = text.match(re);
      expect(matches).toEqual([`{{student:${UUID_A}}}`, `{{classroom:${UUID_B}}}`]);
    });
  });
});
