import { describe, it, expect } from "vitest";
import {
  buildTokenMap,
  redact,
  detokenize,
  snapshotTokenMap,
  tokenMapFromSnapshot,
} from "@/lib/tokens/token-map";
import { formatStudentToken, formatClassroomToken } from "@/lib/tokens/format";
import type { TokenRef } from "@/lib/tokens/types";

const A_ID = "7e1c8a3b-2f4d-4d6c-9a3e-12abcd34ef56";
const B_ID = "11111111-2222-3333-4444-555555555555";
const C_ID = "22222222-3333-4444-5555-666666666666";

const refs: TokenRef[] = [
  { id: A_ID, display: "Amelia", kind: "student", token: formatStudentToken(A_ID) },
  { id: B_ID, display: "Liam", kind: "student", token: formatStudentToken(B_ID) },
  { id: C_ID, display: "Sunshine Room", kind: "classroom", token: formatClassroomToken(C_ID) },
];

describe("redact", () => {
  it("replaces a known name with its token (whole-word, case-insensitive)", () => {
    const map = buildTokenMap(refs);
    expect(redact("How is Amelia doing?", map)).toBe(`How is ${formatStudentToken(A_ID)} doing?`);
    expect(redact("how is amelia doing?", map)).toBe(`how is ${formatStudentToken(A_ID)} doing?`);
  });

  it("does not match name fragments embedded in other words", () => {
    const map = buildTokenMap(refs);
    // "Liam" should not match "Liams" mid-word, but the \b regex DOES allow
    // "Liam's" because the apostrophe is a non-word char. Both are correct
    // tokenization outcomes.
    expect(redact("call Liams the project", map)).toBe("call Liams the project");
  });

  it("replaces multiple distinct names", () => {
    const map = buildTokenMap(refs);
    expect(redact("Amelia and Liam are friends.", map)).toBe(
      `${formatStudentToken(A_ID)} and ${formatStudentToken(B_ID)} are friends.`
    );
  });

  it("prefers longer displays over shorter ones", () => {
    const ids = [A_ID, B_ID];
    const longer: TokenRef[] = [
      { id: A_ID, display: "Amelia Hart", kind: "student", token: formatStudentToken(A_ID) },
      { id: ids[1], display: "Amelia", kind: "student", token: formatStudentToken(B_ID) },
    ];
    const map = buildTokenMap(longer);
    expect(redact("Tell me about Amelia Hart", map)).toBe(
      `Tell me about ${formatStudentToken(A_ID)}`
    );
    // Standalone "Amelia" still resolves to the shorter ref.
    expect(redact("Tell me about Amelia", map)).toBe(`Tell me about ${formatStudentToken(B_ID)}`);
  });

  it("handles multi-word displays like 'Sunshine Room'", () => {
    const map = buildTokenMap(refs);
    expect(redact("Welcome to the Sunshine Room today", map)).toBe(
      `Welcome to the ${formatClassroomToken(C_ID)} today`
    );
  });
});

describe("detokenize", () => {
  it("renders tokens as display strings", () => {
    const map = buildTokenMap(refs);
    const result = detokenize(`${formatStudentToken(A_ID)} is doing well.`, map);
    expect(result.text).toBe("Amelia is doing well.");
  });

  it("returns one entity entry per id with all occurrence offsets", () => {
    const map = buildTokenMap(refs);
    const result = detokenize(
      `${formatStudentToken(A_ID)} likes ${formatStudentToken(B_ID)}. ${formatStudentToken(A_ID)} also likes painting.`,
      map
    );
    expect(result.text).toBe("Amelia likes Liam. Amelia also likes painting.");
    expect(result.entities).toHaveLength(2);
    const ameliaEntity = result.entities.find((e) => e.id === A_ID);
    expect(ameliaEntity).toBeDefined();
    expect(ameliaEntity!.offsets).toHaveLength(2);
    // Verify the offsets actually slice "Amelia"
    for (const [start, end] of ameliaEntity!.offsets) {
      expect(result.text.slice(start, end)).toBe("Amelia");
    }
  });

  it("passes unknown tokens through verbatim", () => {
    const map = buildTokenMap(refs);
    const unknownUuid = "99999999-9999-9999-9999-999999999999";
    const result = detokenize(`Hello {{student:${unknownUuid}}} there.`, map);
    expect(result.text).toBe(`Hello {{student:${unknownUuid}}} there.`);
    expect(result.entities).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    const map = buildTokenMap(refs);
    expect(detokenize("", map)).toEqual({ text: "", entities: [] });
  });
});

describe("redact + detokenize round-trip", () => {
  it("preserves the original text when display strings match exactly", () => {
    const map = buildTokenMap(refs);
    const original = "Amelia and Liam played in the Sunshine Room.";
    const redacted = redact(original, map);
    const back = detokenize(redacted, map);
    expect(back.text).toBe(original);
  });
});

describe("snapshotTokenMap + tokenMapFromSnapshot", () => {
  it("round-trips a token map through serialization", () => {
    const original = buildTokenMap(refs);
    const snapshot = snapshotTokenMap(original);
    const restored = tokenMapFromSnapshot(snapshot);
    expect(restored.reverse.size).toBe(original.reverse.size);
    expect(detokenize(formatStudentToken(A_ID), restored).text).toBe("Amelia");
  });
});
