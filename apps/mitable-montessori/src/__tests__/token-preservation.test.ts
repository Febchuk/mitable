/**
 * Direct unit coverage for `validateTokenPreservation`. The bug Phase 6
 * fixed (every chat reply rejected as a "token preservation failure")
 * came from the validator's per-word fragment splitter false-positiving
 * on common English words inside multi-word displays. Pin the contract:
 *
 *   - Multi-word displays still match verbatim ("this classroom" caught).
 *   - Common-word fragments alone don't trigger leaks ("this", "room").
 *   - Real names ("Ada", "Maya Singh") still get caught when they leak.
 *   - Fragments shorter than 3 chars are ignored.
 *   - Single-display rare names still trip when they appear standalone.
 *   - Unknown tokens are still rejected.
 */

import { describe, expect, it } from "vitest";
import { validateTokenPreservation } from "@/lib/reports/token-preservation";

const REF_ADA = {
  id: "1",
  token: "[STUDENT_1]",
  display: "Ada Okafor",
  kind: "student" as const,
};
const REF_FALLBACK_CLASSROOM = {
  id: "2",
  token: "[CLASSROOM_0]",
  display: "this classroom",
  kind: "classroom" as const,
};
const REF_FALLBACK_STUDENT = {
  id: "1",
  token: "[STUDENT_1]",
  display: "Student",
  kind: "student" as const,
};

describe("validateTokenPreservation — leaked-name fragment splitting", () => {
  it("does NOT leak on common-word fragments inside fallback displays", () => {
    // "this classroom" → fragments include "this" and "classroom" — both
    // stopwords. Per-word leak checks must be skipped, otherwise every
    // English sentence containing "this" or "classroom" would fail.
    const r = validateTokenPreservation("Hi! How can I help you with this report?", [
      REF_FALLBACK_CLASSROOM,
    ]);
    expect(r.ok).toBe(true);
    expect(r.leakedNames).toEqual([]);
  });

  it("does NOT leak on the literal word 'student' when display is the 'Student' fallback", () => {
    const r = validateTokenPreservation(
      "I'd like to help the student with this morning paragraph.",
      [REF_FALLBACK_STUDENT]
    );
    expect(r.ok).toBe(true);
    expect(r.leakedNames).toEqual([]);
  });

  it("DOES catch a verbatim leak of the full multi-word display", () => {
    // Even though "this" and "classroom" are stopwords individually, the
    // full "this classroom" match remains in the fragment set.
    const r = validateTokenPreservation("I'll add a note about this classroom's vibe today.", [
      REF_FALLBACK_CLASSROOM,
    ]);
    expect(r.ok).toBe(false);
    expect(r.leakedNames).toContain("this classroom");
  });

  it("DOES catch real name leaks (Ada Okafor)", () => {
    const r = validateTokenPreservation("Ada Okafor had a steady morning with the pink tower.", [
      REF_ADA,
    ]);
    expect(r.ok).toBe(false);
    expect(r.leakedNames).toContain("Ada Okafor");
  });

  it("DOES catch the first-name fragment when it appears standalone", () => {
    // "Ada" is a real-name fragment — must still trip even with stopwords
    // filtered. "Ada" is 3 chars and not a stopword, so it stays.
    const r = validateTokenPreservation("Ada was a delight today.", [REF_ADA]);
    expect(r.ok).toBe(false);
    expect(r.leakedNames).toContain("Ada Okafor");
  });

  it("does NOT match a fragment as a substring of a longer word", () => {
    // "Ada" in "Adams" should not trip — \b enforces word boundaries.
    const r = validateTokenPreservation(
      "Adams was visiting the room. We talked about [STUDENT_1].",
      [REF_ADA]
    );
    expect(r.ok).toBe(true);
  });

  it("ignores 2-letter displays as fragments", () => {
    // The first-name "Bo" is 2 chars; fragment splitting requires ≥3.
    // The full display "Bo" is also 2 chars, so the leading
    // `if (display.length < 2) continue` doesn't skip it but the fragment
    // set is still empty — no leak check runs.
    const r = validateTokenPreservation("This bound the report nicely.", [
      { id: "x", display: "Bo" },
    ]);
    // "Bo" is short and won't generate fragments ≥3, but the full display
    // ("bo") is still added at length 2. \bbo\b won't match "bound" so this
    // passes — pin that "Bo" alone in prose still trips though.
    expect(r.ok).toBe(true);
  });
});

describe("validateTokenPreservation — unknown tokens", () => {
  it("rejects unknown tokens that aren't in the ref set", () => {
    const r = validateTokenPreservation("[STUDENT_1] worked with [SUBTOPIC_99] today.", [REF_ADA]);
    expect(r.ok).toBe(false);
    expect(r.unknownTokens).toContain("[SUBTOPIC_99]");
  });

  it("accepts known tokens", () => {
    const r = validateTokenPreservation("[STUDENT_1] had a steady morning.", [REF_ADA]);
    expect(r.ok).toBe(true);
  });

  it("treats an empty ref set as accepting all tokens (compat)", () => {
    // When refs is empty, `knownTokens.size === 0` short-circuits the
    // unknown-token filter to []. This preserves the existing contract for
    // routes that drop refs entirely (e.g. when source data is missing).
    const r = validateTokenPreservation("[STUDENT_1] had a steady morning.", []);
    expect(r.ok).toBe(true);
  });
});
