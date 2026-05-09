import { describe, it, expect } from "vitest";
import { validateAgentOutput } from "@/lib/tokens/validate-output";
import { buildTokenMap } from "@/lib/tokens/token-map";
import { formatStudentToken, formatClassroomToken } from "@/lib/tokens/format";
import type { TokenRef } from "@/lib/tokens/types";

const A_ID = "7e1c8a3b-2f4d-4d6c-9a3e-12abcd34ef56";
const B_ID = "11111111-2222-3333-4444-555555555555";
const ROOM_ID = "22222222-3333-4444-5555-666666666666";

const refs: TokenRef[] = [
  { id: A_ID, display: "Amelia", kind: "student", token: formatStudentToken(A_ID) },
  { id: B_ID, display: "Liam", kind: "student", token: formatStudentToken(B_ID) },
  {
    id: ROOM_ID,
    display: "Sunshine Room",
    kind: "classroom",
    token: formatClassroomToken(ROOM_ID),
  },
];

describe("validateAgentOutput", () => {
  it("passes clean output with valid tokens", () => {
    const map = buildTokenMap(refs);
    const result = validateAgentOutput(
      `${formatStudentToken(A_ID)} is doing great this week.`,
      map
    );
    expect(result.ok).toBe(true);
    expect(result.leakedNames).toEqual([]);
    expect(result.unknownTokens).toEqual([]);
  });

  it("rejects output that leaks a known first name", () => {
    const map = buildTokenMap(refs);
    const result = validateAgentOutput("Amelia is doing great this week.", map);
    expect(result.ok).toBe(false);
    expect(result.leakedNames).toContain("Amelia");
  });

  it("rejects an invented UUID", () => {
    const map = buildTokenMap(refs);
    const fake = "99999999-9999-9999-9999-999999999999";
    const result = validateAgentOutput(`{{student:${fake}}} is here.`, map);
    expect(result.ok).toBe(false);
    expect(result.unknownTokens).toContain(`{{student:${fake}}}`);
  });

  it("does not trip on benign English containing stop-word fragments", () => {
    const map = buildTokenMap(refs);
    // Display "Sunshine Room" -> "room" is a stop-word, but the multi-word
    // display would still trip if it appeared verbatim. "this room" is benign.
    const result = validateAgentOutput(
      `${formatClassroomToken(ROOM_ID)} is open today. The room is sunny.`,
      map
    );
    expect(result.ok).toBe(true);
  });

  it("trips on a multi-word display appearing verbatim", () => {
    const map = buildTokenMap(refs);
    const result = validateAgentOutput("Sunshine Room is open today.", map);
    expect(result.ok).toBe(false);
    expect(result.leakedNames).toContain("Sunshine Room");
  });

  it("reports both leaks and unknown tokens together", () => {
    const map = buildTokenMap(refs);
    const fake = "99999999-9999-9999-9999-999999999999";
    const result = validateAgentOutput(`Amelia is fine. {{student:${fake}}} is also fine.`, map);
    expect(result.ok).toBe(false);
    expect(result.leakedNames).toContain("Amelia");
    expect(result.unknownTokens).toContain(`{{student:${fake}}}`);
  });
});
