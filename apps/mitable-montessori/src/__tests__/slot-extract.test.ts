import { describe, expect, it } from "vitest";

import {
  countWords,
  extractAttendanceStatus,
  extractComment,
  extractDate,
  extractMasteryStatus,
  firstStudentToken,
  firstSubtopicToken,
  hasStudentToken,
  hasSubtopicToken,
} from "@/lib/capture/slot-extract";

describe("slot-extract — attendance status", () => {
  it("detects 'is here' as present", () => {
    expect(extractAttendanceStatus("[STUDENT_1] is here")).toBe("present");
  });
  it("detects 'showed up' as present", () => {
    expect(extractAttendanceStatus("[STUDENT_1] showed up this morning")).toBe("present");
  });
  it("detects 'was sick today' as absent", () => {
    expect(extractAttendanceStatus("[STUDENT_1] was sick today")).toBe("absent");
  });
  it("detects 'mark out' as absent", () => {
    expect(extractAttendanceStatus("Mark [STUDENT_1] out")).toBe("absent");
  });
  it("detects 'didn't come' as absent", () => {
    expect(extractAttendanceStatus("[STUDENT_1] didn't come in today")).toBe("absent");
  });
  it("detects 'called in sick' as absent", () => {
    expect(extractAttendanceStatus("[STUDENT_1] called in sick")).toBe("absent");
  });
  it("returns null with no attendance verb", () => {
    expect(extractAttendanceStatus("[STUDENT_1] tried [SUBTOPIC_1]")).toBeNull();
  });
});

describe("slot-extract — mastery status", () => {
  it("'mastered' → mastered", () => {
    expect(extractMasteryStatus("[STUDENT_1] mastered [SUBTOPIC_1]")).toBe("mastered");
  });
  it("'finished' → mastered", () => {
    expect(extractMasteryStatus("[STUDENT_1] finished [SUBTOPIC_1]")).toBe("mastered");
  });
  it("'on her own' → mastered", () => {
    expect(extractMasteryStatus("[STUDENT_1] did [SUBTOPIC_1] on her own")).toBe("mastered");
  });
  it("'introduce to' → introduced", () => {
    expect(extractMasteryStatus("Introduce [STUDENT_1] to [SUBTOPIC_1]")).toBe("introduced");
  });
  it("'first time' → introduced", () => {
    expect(extractMasteryStatus("[STUDENT_1] first time on [SUBTOPIC_1]")).toBe("introduced");
  });
  it("'worked on' → practicing", () => {
    expect(extractMasteryStatus("[STUDENT_1] worked on [SUBTOPIC_1]")).toBe("practicing");
  });
  it("'poured water without spilling' → practicing", () => {
    expect(extractMasteryStatus("[STUDENT_1] poured water without spilling")).toBe("practicing");
  });
  it("returns null with no mastery verb", () => {
    expect(extractMasteryStatus("[STUDENT_1] is here")).toBeNull();
  });
  it("mastered beats practicing when both verbs present", () => {
    expect(extractMasteryStatus("[STUDENT_1] practiced and mastered [SUBTOPIC_1]")).toBe(
      "mastered"
    );
  });
});

describe("slot-extract — token detection", () => {
  it("finds first STUDENT_n", () => {
    expect(firstStudentToken("hello [STUDENT_2] and [STUDENT_3]")).toBe("[STUDENT_2]");
  });
  it("finds first SUBTOPIC_n", () => {
    expect(firstSubtopicToken("[STUDENT_1] worked on [SUBTOPIC_4]")).toBe("[SUBTOPIC_4]");
  });
  it("hasStudentToken / hasSubtopicToken", () => {
    expect(hasStudentToken("[STUDENT_1] is here")).toBe(true);
    expect(hasStudentToken("nothing here")).toBe(false);
    expect(hasSubtopicToken("[STUDENT_1] tried [SUBTOPIC_1]")).toBe(true);
    expect(hasSubtopicToken("[STUDENT_1] is here")).toBe(false);
  });
});

describe("slot-extract — date", () => {
  it("defaults to today", () => {
    expect(extractDate("[STUDENT_1] is here", "2026-05-06")).toBe("2026-05-06");
  });
  it("shifts to yesterday", () => {
    expect(extractDate("[STUDENT_1] was out yesterday", "2026-05-06")).toBe("2026-05-05");
  });
  it("shifts to tomorrow", () => {
    expect(extractDate("[STUDENT_1] is here tomorrow", "2026-05-06")).toBe("2026-05-07");
  });
  it("uses explicit ISO date", () => {
    expect(extractDate("[STUDENT_1] was out 2026-04-30", "2026-05-06")).toBe("2026-04-30");
  });
  it("crosses month boundary on yesterday", () => {
    expect(extractDate("[STUDENT_1] was sick yesterday", "2026-05-01")).toBe("2026-04-30");
  });
});

describe("slot-extract — comment", () => {
  it("strips tokens and date words", () => {
    const c = extractComment("[STUDENT_1] is here today and very excited");
    expect(c).not.toContain("[STUDENT_1]");
    expect(c).not.toContain("today");
    expect(c).toContain("very excited");
  });
  it("strips additional removed spans", () => {
    const c = extractComment("[STUDENT_1] mastered [SUBTOPIC_1] without help yay", [
      "mastered",
      "without help",
    ]);
    expect(c).not.toContain("mastered");
    expect(c).not.toContain("without help");
    expect(c).toContain("yay");
  });
  it("caps at 500 chars", () => {
    const long = "x".repeat(600);
    expect(extractComment(long).length).toBeLessThanOrEqual(500);
  });
  it("returns empty string when nothing left", () => {
    expect(extractComment("[STUDENT_1] [SUBTOPIC_1] today")).toBe("");
  });
});

describe("slot-extract — countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("the quick brown fox")).toBe(4);
  });
  it("returns 0 for empty/whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});
