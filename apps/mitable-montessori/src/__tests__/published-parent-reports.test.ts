import { expect, it } from "vitest";
import { listPublishedReports, loadPublishedReport } from "@/lib/parents/published-reports";
import { reportMemoryDb } from "./helpers/report-memory-db";

it("reads the last explicitly shared version while a correction is still a draft", async () => {
  const { db } = reportMemoryDb({
    reports: [{ id: "r", status: "draft", body: "Private correction" }],
    report_publications: [
      {
        report_id: "r",
        student_id: "child",
        published_at: "2026-11-19T12:00:00Z",
        snapshot: { body: "Shared with the family", template_logo_url: "/logo.png" },
      },
    ],
  });
  expect(await loadPublishedReport(db, "r")).toMatchObject({
    body: "Shared with the family",
    template_logo_url: "/logo.png",
  });
  expect(await loadPublishedReport(db, "unknown")).toBeNull();
});
it("lists one current version per report and keeps other children separate", async () => {
  const { db } = reportMemoryDb({
    report_publications: [
      {
        report_id: "r",
        student_id: "child",
        published_at: "2026-11-18",
        snapshot: { body: "First version" },
      },
      {
        report_id: "r",
        student_id: "child",
        published_at: "2026-11-19",
        snapshot: { body: "Sent update" },
      },
      {
        report_id: "other",
        student_id: "another-child",
        published_at: "2026-11-19",
        snapshot: { body: "Other child" },
      },
    ],
  });
  expect(await listPublishedReports(db, "child")).toMatchObject([{ id: "r", body: "Sent update" }]);
});
