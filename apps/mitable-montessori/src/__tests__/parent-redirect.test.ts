import { describe, expect, it } from "vitest";
import { safeParentRedirect } from "@/lib/parents/redirect";

describe("parent sign-in redirect", () => {
  it("keeps an exact report and child destination", () => {
    expect(safeParentRedirect("/parents/reports/report-1?child=student-1")).toBe(
      "/parents/reports/report-1?child=student-1"
    );
  });

  it("rejects destinations outside the parent portal", () => {
    expect(safeParentRedirect("https://attacker.example/parents/reports")).toBeNull();
    expect(safeParentRedirect("//attacker.example/parents/reports")).toBeNull();
    expect(safeParentRedirect("/app/reports/report-1")).toBeNull();
  });
});
