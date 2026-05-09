import { describe, it, expect } from "vitest";
import { resolveMentions } from "@/lib/agent/resolve-mentions";
import type { RosterStudent } from "@/lib/agent/roster";
import { formatStudentToken } from "@/lib/tokens/format";

const A_ID = "7e1c8a3b-2f4d-4d6c-9a3e-12abcd34ef56";
const B_ID = "11111111-2222-3333-4444-555555555555";
const C_ID = "22222222-3333-4444-5555-666666666666";

const roster: RosterStudent[] = [
  {
    id: A_ID,
    schoolId: "s1",
    classroomId: "c1",
    firstName: "Amelia",
    lastName: "Hart",
    preferredName: null,
    nicknames: [],
    display: "Amelia Hart",
    needles: ["Amelia", "Hart", "Amelia Hart"],
  },
  {
    id: B_ID,
    schoolId: "s1",
    classroomId: "c1",
    firstName: "Liam",
    lastName: "Singh",
    preferredName: null,
    nicknames: [],
    display: "Liam Singh",
    needles: ["Liam", "Singh", "Liam Singh"],
  },
  {
    id: C_ID,
    schoolId: "s1",
    classroomId: "c1",
    firstName: "Liam",
    lastName: "Garcia",
    preferredName: null,
    nicknames: [],
    display: "Liam Garcia",
    needles: ["Liam", "Garcia", "Liam Garcia"],
  },
];

describe("resolveMentions", () => {
  it("resolves an exact first-name match when unambiguous", () => {
    const noLiamCollision = roster.filter((r) => r.id !== C_ID);
    const result = resolveMentions({
      message: "How is Amelia doing this week?",
      roster: noLiamCollision,
    });
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].id).toBe(A_ID);
    expect(result.rewrittenMessage).toBe(`How is ${formatStudentToken(A_ID)} doing this week?`);
    expect(result.ambiguities).toEqual([]);
  });

  it("flags ambiguity when two students share a first name", () => {
    const result = resolveMentions({
      message: "Tell me about Liam",
      roster,
    });
    // Both Liams should appear as candidates; nothing auto-resolved.
    expect(result.ambiguities).toHaveLength(1);
    expect(result.ambiguities[0].fragment).toBe("Liam");
    expect(result.ambiguities[0].candidates.length).toBeGreaterThanOrEqual(2);
    // Tokens were not minted for ambiguous fragments.
    expect(result.rewrittenMessage).toBe("Tell me about Liam");
  });

  it("inbound mentions from the UI override fuzzy ambiguity", () => {
    const result = resolveMentions({
      message: "Tell me about Liam",
      roster,
      inboundMentions: [{ kind: "student", id: B_ID, display: "Liam Singh" }],
    });
    // UI picked Liam Singh; ambiguity should be suppressed and the bare
    // fragment "Liam" should redact to Singh's token.
    expect(result.ambiguities).toEqual([]);
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].id).toBe(B_ID);
    expect(result.rewrittenMessage).toBe(`Tell me about ${formatStudentToken(B_ID)}`);
  });

  it("does not resolve names not in the roster", () => {
    const result = resolveMentions({
      message: "How is Zedekiah doing?",
      roster,
    });
    expect(result.refs).toHaveLength(0);
    expect(result.rewrittenMessage).toBe("How is Zedekiah doing?");
  });

  it("handles fuzzy typos within threshold", () => {
    const noLiamCollision = roster.filter((r) => r.id !== C_ID);
    // "Ameliah" (extra h) is within Fuse threshold 0.3 of "Amelia"
    const result = resolveMentions({
      message: "How is Ameliah doing?",
      roster: noLiamCollision,
    });
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].id).toBe(A_ID);
  });

  it("returns empty when message has no roster matches", () => {
    const result = resolveMentions({
      message: "What is the weather like today?",
      roster,
    });
    expect(result.refs).toHaveLength(0);
    expect(result.rewrittenMessage).toBe("What is the weather like today?");
    expect(result.ambiguities).toEqual([]);
  });
});
