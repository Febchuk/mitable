import { describe, expect, it } from "vitest";
import {
  dbToddlerDailyLogToDto,
  toddlerDailyLogReportHtml,
  type ToddlerDailyLog,
} from "./toddler-routines";

describe("toddler routines", () => {
  it("maps stored daily logs without leaking nulls into the form", () => {
    expect(
      dbToddlerDailyLogToDto({
        id: "log-1",
        student_id: "student-1",
        classroom_id: "class-1",
        log_date: "2026-09-02",
        mood: null,
        nap: null,
        participation: null,
      })
    ).toMatchObject({
      id: "log-1",
      mood: "",
      nap: "",
      participation: "",
      toiletingEntries: [],
      activityOptionIds: [],
    });
  });

  it("turns a daily log into report-safe readable HTML", () => {
    const log: ToddlerDailyLog = {
      id: "log-1",
      studentId: "student-1",
      classroomId: "class-1",
      logDate: "2026-09-02",
      mood: "Cheerful",
      nap: "Slept",
      participation: "Interactive",
      toiletingEntries: [{ id: "t-1", time: "09:15", outcome: "Wee" }],
      feedingEntries: [{ id: "f-1", time: "10:30", outcome: "Ate well", detail: "Pasta" }],
      outdoorPlayEntries: [{ id: "o-1", time: "11:00", outcome: "Enjoyed" }],
      activityOptionIds: ["a-1"],
      activityLabels: ["Storytime"],
      materialOptionIds: ["m-1"],
      materialLabels: ["Stringing"],
      otherNotes: "Asked for more water.",
      teacherComments: "A happy day.",
    };

    const html = toddlerDailyLogReportHtml(log, "present · arrived 08:10");
    expect(html).toContain("Attendance: present · arrived 08:10");
    expect(html).toContain("10:30 — Ate well — Pasta");
    expect(html).toContain("Activities: Storytime");
    expect(html).toContain("Montessori materials: Stringing");
    expect(html).not.toContain("<script");
  });
});
