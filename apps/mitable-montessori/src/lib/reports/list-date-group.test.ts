import { describe, it, expect } from "vitest";
import { getReportListDateGroupLabel, groupReportsByDateLabel } from "./list-date-group";

const row = (updatedAt: string) => ({
  updatedAt,
  createdAt: updatedAt,
  reportDate: null as string | null,
});

describe("getReportListDateGroupLabel", () => {
  const now = new Date(2026, 4, 21, 15, 0, 0);

  it("returns Today for same calendar day", () => {
    const iso = new Date(2026, 4, 21, 10).toISOString();
    expect(getReportListDateGroupLabel(iso, now, "en-US")).toBe("Today");
  });

  it("returns Yesterday for previous calendar day", () => {
    const iso = new Date(2026, 4, 20, 10).toISOString();
    expect(getReportListDateGroupLabel(iso, now, "en-US")).toBe("Yesterday");
  });

  it("returns weekday name within the same week", () => {
    const iso = new Date(2026, 4, 18, 10).toISOString();
    expect(getReportListDateGroupLabel(iso, now, "en-US")).toBe("Monday");
  });

  it("returns a calendar date for an earlier week", () => {
    const iso = new Date(2026, 4, 14, 10).toISOString();
    const label = getReportListDateGroupLabel(iso, now, "en-US");
    expect(label).toMatch(/May/);
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
  });
});

describe("groupReportsByDateLabel", () => {
  it("orders sections newest-first", () => {
    const now = new Date(2026, 4, 21, 12);
    const groups = groupReportsByDateLabel(
      [
        row(new Date(2026, 4, 10, 10).toISOString()),
        row(new Date(2026, 4, 21, 10).toISOString()),
        row(new Date(2026, 4, 20, 10).toISOString()),
      ],
      { now, locale: "en-US" }
    );
    expect(groups[0]?.label).toBe("Today");
    expect(groups[1]?.label).toBe("Yesterday");
  });
});
