import { describe, expect, it } from "vitest";

import {
  buildOfflineClarification,
  resolveLocally,
} from "@/lib/capture/local-resolve";
import {
  StubIntentClassifier,
  type IntentLabel,
} from "@/lib/capture/intent-classifier";
import type { TokenReference } from "@/lib/tokenize/types";

const REFS: TokenReference[] = [
  { token: "[STUDENT_1]", id: "student-1", display: "Maya Singh", kind: "student" },
  { token: "[SUBTOPIC_1]", id: "subtopic-1", display: "Pink Tower", kind: "subtopic" },
];

const CLASSROOM_ID = "22222222-2222-2222-2222-222222222222";
const TODAY = "2026-05-06";

function stub(label: IntentLabel, score: number, margin: number) {
  return new StubIntentClassifier(() => ({ label, score, margin }));
}

describe("resolveLocally — happy paths", () => {
  it("A: progress utterance with subtopic + verb → record_progress", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "[STUDENT_1] mastered [SUBTOPIC_1]",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("record_progress", 0.85, 0.4)
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.calls).toHaveLength(1);
    expect(out.calls[0].tool).toBe("record_progress");
    if (out.calls[0].tool !== "record_progress") return;
    expect(out.calls[0].args.student_token).toBe("[STUDENT_1]");
    expect(out.calls[0].args.subtopic_token).toBe("[SUBTOPIC_1]");
    expect(out.calls[0].args.status).toBe("mastered");
    expect(out.intentScore).toBe(0.85);
    expect(out.source).toBe("local");
  });

  it("B: attendance utterance → mark_attendance", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "[STUDENT_1] is here",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("mark_attendance", 0.78, 0.3)
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.calls).toHaveLength(1);
    expect(out.calls[0].tool).toBe("mark_attendance");
    if (out.calls[0].tool !== "mark_attendance") return;
    expect(out.calls[0].args.status).toBe("present");
    expect(out.calls[0].args.date).toBe(TODAY);
  });

  it("F: clear note utterance → add_observation_note", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "[STUDENT_1] was very focused during work cycle and shared with peers",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("add_observation_note", 0.82, 0.3)
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.calls).toHaveLength(1);
    expect(out.calls[0].tool).toBe("add_observation_note");
    if (out.calls[0].tool !== "add_observation_note") return;
    expect(out.calls[0].args.student_token).toBe("[STUDENT_1]");
    expect(out.calls[0].args.text).toContain("focused");
  });

  it("G: combined attendance + progress → two calls", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "Mark [STUDENT_1] present and [SUBTOPIC_1] practicing",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("mark_attendance", 0.8, 0.3)
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.calls).toHaveLength(2);
    expect(out.calls.find((c) => c.tool === "mark_attendance")).toBeDefined();
    const prog = out.calls.find((c) => c.tool === "record_progress");
    expect(prog).toBeDefined();
    if (prog?.tool !== "record_progress") return;
    expect(prog.args.subtopic_token).toBe("[SUBTOPIC_1]");
    expect(prog.args.status).toBe("practicing");
  });

  it("attendance date uses 'yesterday' when present", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "[STUDENT_1] was sick yesterday",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: "2026-05-06",
      },
      stub("mark_attendance", 0.8, 0.3)
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    if (out.calls[0].tool !== "mark_attendance") return;
    expect(out.calls[0].args.date).toBe("2026-05-05");
    expect(out.calls[0].args.status).toBe("absent");
  });
});

describe("resolveLocally — fallback reasons", () => {
  it("C: progress, no subtopic → missing_subtopic", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "[STUDENT_1] worked hard today",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("record_progress", 0.85, 0.4)
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("missing_subtopic");
    expect(out.topLabel).toBe("record_progress");
  });

  it("D: low score → low_confidence", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "something something",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("add_observation_note", 0.45, 0.05)
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("low_confidence");
  });

  it("D2: low margin → low_confidence", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "[STUDENT_1] is here",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      // High score but margin too small → ambiguous
      stub("mark_attendance", 0.7, 0.05)
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("low_confidence");
  });

  it("E: rambling 80-word note → too_long", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const out = await resolveLocally(
      {
        tokenizedText: `[STUDENT_1] ${long}`,
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("add_observation_note", 0.9, 0.5)
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("too_long");
  });

  it("attendance with no student token → no_student", async () => {
    const out = await resolveLocally(
      {
        tokenizedText: "everybody is here",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      stub("mark_attendance", 0.85, 0.4)
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no_student");
  });
});

describe("buildOfflineClarification", () => {
  it("includes the top student candidates", () => {
    const call = buildOfflineClarification(
      {
        tokenizedText: "[STUDENT_1]",
        references: REFS,
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      "mark_attendance"
    );
    expect(call.tool).toBe("request_clarification");
    if (call.tool !== "request_clarification") return;
    expect(call.args.candidates).toHaveLength(1);
    expect(call.args.candidates?.[0]?.display).toBe("Maya Singh");
    expect(call.args.question).toMatch(/attendance/i);
  });

  it("uses generic question for request_clarification top label", () => {
    const call = buildOfflineClarification(
      {
        tokenizedText: "",
        references: [],
        classroomId: CLASSROOM_ID,
        todayIso: TODAY,
      },
      "request_clarification"
    );
    expect(call.tool).toBe("request_clarification");
    if (call.tool !== "request_clarification") return;
    expect(call.args.question).toMatch(/say it again/i);
    expect(call.args.candidates).toEqual([]);
  });
});
