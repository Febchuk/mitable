/**
 * Adapter: real `ReportListRowV2` → the v2 UI row shape (a.k.a. `MockReport`,
 * still named that for now since Phase 1 was built against fixtures).
 *
 * Phase 4 (AI score) and Phase 5 (admin/scheduling) will move fields like
 * `aiFlags`, `aiReasoning`, `scheduledSend`, `deliveryRead/Total` onto the
 * real row. Until then we fill those with sensible derived defaults so the
 * UI never has to special-case "missing field".
 */

import type { ReportListRowV2 } from "@/lib/queries/reports";
import type { AIFlag, MockReport, V2ReportType, V2Reviewer, V2Tone } from "./mock-data";

const TYPE_TO_UI: Record<ReportListRowV2["reportType"], V2ReportType> = {
  daily: "DAILY",
  major: "MAJOR",
  incident: "INCIDENT",
};

const TONE_ROTATION: V2Tone[] = ["clay", "sage", "butter", "blue"];

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "??"
  );
}

function toneFor(seed: string): V2Tone {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONE_ROTATION[Math.abs(h) % TONE_ROTATION.length];
}

function relativeTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Default AI flag set keyed off the score band. Phase 4 replaces this with
 *  the scorer's actual flag emission. */
function defaultFlags(score: number): AIFlag[] {
  if (score >= 85) {
    return [
      { kind: "tone", status: "ok", note: "Calibrated" },
      { kind: "evidence", status: "ok", note: "Strong" },
      { kind: "pii", status: "ok", note: "No PII risk" },
      { kind: "template", status: "ok", note: "Complete" },
    ];
  }
  if (score >= 60) {
    return [
      { kind: "tone", status: "ok", note: "Calibrated" },
      { kind: "evidence", status: "warn", note: "Could use another behavior" },
      { kind: "pii", status: "ok", note: "Clear" },
      { kind: "template", status: "warn", note: "One section thin" },
    ];
  }
  return [
    { kind: "tone", status: "warn", note: "Slightly evaluative" },
    { kind: "evidence", status: "warn", note: "Sparse" },
    { kind: "pii", status: "ok", note: "Clear" },
    { kind: "template", status: "fail", note: "Sections missing" },
  ];
}

function defaultReasoning(score: number): string[] {
  if (score >= 85) {
    return [
      "High-confidence draft — green-tier reports rarely change in review.",
      "Tone calibrated, evidence specific, template adherence within range.",
    ];
  }
  if (score >= 60) {
    return [
      "Worth a closer read — one or two sections could be tightened.",
      "Evidence is solid but lacks variety; consider an additional cited behavior.",
    ];
  }
  return [
    "Body is under the usual length for this report type.",
    "Tone leans evaluative — prefer descriptive observation.",
    "Template sections are incomplete.",
  ];
}

/** Build a UI row from a real DB row. */
export function adaptReportListRow(row: ReportListRowV2, authorName = "Teacher"): MockReport {
  const tone = toneFor(row.studentId);

  const reviewers: V2Reviewer[] | undefined =
    row.tab === "review"
      ? Array.from({ length: row.reviewerTicks.total }, (_, i) => ({
          initials: ["MW", "DR", "JT"][i] ?? "??",
          name: ["Mei Wong", "Diego Ruiz", "Jamie Tao"][i] ?? "Reviewer",
          tone: TONE_ROTATION[i % TONE_ROTATION.length],
          ticked: i < row.reviewerTicks.approved,
        }))
      : undefined;

  const title = row.title ?? `${TYPE_TO_UI[row.reportType]} report`;

  // The list-row summary line. Today we have no synopsis stored on `reports`,
  // so we synthesize one from status. Phase 4 surfaces the scorer's tl;dr.
  const summary =
    row.tab === "drafts"
      ? "Draft saved · ready to send for review when complete."
      : row.tab === "review"
        ? `${row.reviewerTicks.approved} of ${row.reviewerTicks.total} reviewers approved.`
        : row.tab === "approved"
          ? "Cleared by admin · awaiting delivery to parents."
          : "Delivered to guardians.";

  return {
    id: row.id,
    childName: row.studentName,
    childInitials: initialsOf(row.studentName),
    childTone: tone,
    reportType: TYPE_TO_UI[row.reportType],
    title,
    summary,
    tab: row.tab,
    aiScore: row.aiScore,
    aiFlags: defaultFlags(row.aiScore),
    aiReasoning: defaultReasoning(row.aiScore),

    completenessPercent: row.tab === "drafts" ? row.completenessPercent : undefined,
    reviewers,
    scheduledSend: row.tab === "approved" ? "Fri · 4:00p" : undefined,
    deliveryRead: row.tab === "sent" ? 1 : undefined,
    deliveryTotal: row.tab === "sent" ? 1 : undefined,
    hasReply: false,

    lastEditedAgo: row.tab === "drafts" ? relativeTime(row.updatedAt) : undefined,
    sentAgo: row.tab === "review" ? relativeTime(row.lastSubmittedAt) : undefined,
    approvedBy: row.tab === "approved" ? "Admin" : undefined,
    sentAt: row.tab === "sent" ? relativeTime(row.updatedAt) : undefined,

    authorInitials: initialsOf(authorName),
    authorName,

    isUrgent: row.reportType === "incident" && row.tab === "review",
    isReadyToPromote: row.tab === "review" && row.reviewerTicks.approved >= row.reviewerTicks.total,
  };
}
