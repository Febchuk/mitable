import { describe, expect, it } from "vitest";
import { parseToddlerDailyLogSummary } from "./toddler-daily-log-summary";

describe("parseToddlerDailyLogSummary", () => {
  it("groups timed details under the right illustrated field", () => {
    const items = parseToddlerDailyLogSummary(
      [
        "Mood: Cheerful",
        "Nap: Slept briefly",
        "Potty time / diapering:",
        "• 10:15 — Dry",
        "• 12:20 — Wee",
        "Feeding: Not recorded",
        "Teacher comments: A joyful day.",
      ].join("\n")
    );

    expect(items).toMatchObject([
      { label: "Mood", value: "Cheerful", illustration: "mood" },
      { label: "Nap", value: "Slept briefly", illustration: "nap" },
      {
        label: "Potty time / diapering",
        value: "",
        details: ["10:15 — Dry", "12:20 — Wee"],
        illustration: "toileting",
      },
      { label: "Feeding", value: "Not recorded", illustration: "feeding" },
      { label: "Teacher comments", value: "A joyful day.", illustration: "notes" },
    ]);
  });
});
