import { describe, expect, it } from "vitest";
import { dailyProgressReason } from "@/lib/reports/daily-progress-batch";

describe("daily progress report readiness", () => {
  it("selects a child only when progress and a family contact are available", () => {
    expect(dailyProgressReason({ progressCount: 2, guardianCount: 1, reportStatus: null })).toEqual(
      { sendable: true, reason: "ready" }
    );
    expect(dailyProgressReason({ progressCount: 0, guardianCount: 1, reportStatus: null })).toEqual(
      { sendable: false, reason: "no_progress" }
    );
    expect(dailyProgressReason({ progressCount: 2, guardianCount: 0, reportStatus: null })).toEqual(
      { sendable: false, reason: "no_guardian" }
    );
  });

  it("protects reports that are already sent or currently in review", () => {
    expect(
      dailyProgressReason({ progressCount: 2, guardianCount: 1, reportStatus: "sent" })
    ).toEqual({ sendable: false, reason: "sent" });
    expect(
      dailyProgressReason({
        progressCount: 2,
        guardianCount: 1,
        reportStatus: "submitted_for_review",
      })
    ).toEqual({ sendable: false, reason: "in_review" });
  });
});
