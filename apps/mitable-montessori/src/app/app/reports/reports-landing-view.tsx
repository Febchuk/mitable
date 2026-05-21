"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { initialsFor, type Tone } from "@/components/montessori/data";
import type { ReportListRowV2 as ReportListRow } from "@/lib/queries/reports";
import { Avatar } from "@/components/montessori/primitives";
import { NewReportTrigger } from "@/components/montessori/new-report";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import { groupReportsByDateLabel } from "@/lib/reports/list-date-group";
import styles from "./reports-landing.module.css";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

function statusLabel(status: ReportListRow["status"]): string {
  if (status === "draft" || status === "changes_requested") return "Draft";
  if (status === "submitted_for_review" || status === "in_review") return "In review";
  if (status === "approved") return "Approved";
  if (status === "sent") return "Sent";
  return status;
}

function statusClass(status: ReportListRow["status"]): string {
  if (status === "draft" || status === "changes_requested") return styles.statusDraft;
  if (status === "approved" || status === "sent") return styles.statusApproved;
  return styles.statusReview;
}

function kindLabel(t: ReportListRow["reportType"]): string {
  if (t === "daily") return "Daily";
  if (t === "major") return "Major";
  return "Incident";
}

export function ReportsLandingView({ reports }: { reports: ReportListRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useUiLocale();
  const [newReportOpen, setNewReportOpen] = React.useState(false);

  const notice =
    searchParams.get("notice") === "progress-moved"
      ? "Progress tracking lives elsewhere for now — you're on Reports."
      : null;

  const groups = React.useMemo(
    () => groupReportsByDateLabel(reports, { locale }),
    [reports, locale]
  );

  const draftCount = reports.filter(
    (r) => r.status === "draft" || r.status === "changes_requested"
  ).length;

  const openReport = (id: string) => {
    router.push(`/app/reports/${id}`);
  };

  return (
    <div className={styles.wrap}>
      {notice ? <p className={styles.notice}>{notice}</p> : null}

      <h1 className={styles.pageH1}>Reports</h1>
      <p className={styles.pageSub}>
        {reports.length === 0
          ? "Start a new report when you're ready — pick a child and template."
          : draftCount > 0
            ? `${draftCount} draft${draftCount === 1 ? "" : "s"} in progress. Pick one to keep editing, or start fresh.`
            : `${reports.length} report${reports.length === 1 ? "" : "s"} here. Open one to continue or start a new draft.`}
      </p>

      <button
        type="button"
        className={`tap ${styles.ctaBig}`}
        onClick={() => setNewReportOpen(true)}
      >
        <span className={styles.ctaIcon} aria-hidden>
          <FileText size={24} strokeWidth={1.6} />
        </span>
        <span>
          <span className={styles.ctaTitle}>Start a new session</span>
          <span className={styles.ctaSub}>
            Pick a child and a template — then record or type observations.
          </span>
        </span>
        <span className={styles.ctaArrow} aria-hidden>
          <ArrowRight size={16} strokeWidth={2} />
        </span>
      </button>

      <NewReportTrigger open={newReportOpen} onOpenChange={setNewReportOpen} hideButton />

      {groups.length === 0 ? (
        <p className={styles.empty}>
          No reports yet. Use the button above to start your first draft.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label}>
            <div className={styles.sectionLabel}>{group.label}</div>
            {group.items.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`tap ${styles.reportRow}`}
                onClick={() => openReport(r.id)}
              >
                <Avatar
                  initials={initialsFor(r.studentName)}
                  tone={toneFor(r.studentId)}
                  size={40}
                />
                <span style={{ minWidth: 0 }}>
                  <span className={styles.rowMetaT}>
                    {r.studentName}
                    {r.title ? ` — ${r.title}` : ` — ${kindLabel(r.reportType)}`}
                  </span>
                  <span className={styles.rowMetaS}>
                    {r.classroomName ?? "Classroom"} · {kindLabel(r.reportType)}
                  </span>
                </span>
                <span className={`${styles.statusPill} ${statusClass(r.status)}`}>
                  {statusLabel(r.status)}
                </span>
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
