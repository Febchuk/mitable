"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordEvent } from "@/lib/telemetry/events";
import type { ReportReferenceSet } from "@/lib/reports/data-adapter";

export interface ReportDraftButtonProps {
  studentId: string;
  classroomId: string;
  reportType: "daily" | "major";
  /** Period defaults to "yesterday" for daily and "last 30 days" for major. */
  periodStart?: string;
  periodEnd?: string;
  onDraft?: (result: {
    reportId: string;
    title: string;
    body: string;
    references: ReportReferenceSet;
  }) => void;
}

const STUDENT_TOKEN = "[STUDENT_1]";
const CLASSROOM_TOKEN = "[CLASSROOM_0]";

function defaultPeriod(reportType: "daily" | "major") {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (reportType === "daily") return { start: today, end: today };
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: today };
}

export function ReportDraftButton(props: ReportDraftButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    const period = defaultPeriod(props.reportType);
    try {
      const res = await fetch("/api/v1/ai/draft-report", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentToken: STUDENT_TOKEN,
          studentRef: props.studentId,
          classroomToken: CLASSROOM_TOKEN,
          classroomId: props.classroomId,
          reportType: props.reportType,
          periodStart: props.periodStart ?? period.start,
          periodEnd: props.periodEnd ?? period.end,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
        if (data.reason) {
          recordEvent({
            name: "agent_loop_aborted",
            turns: 0,
            reason: data.reason,
          });
        }
        throw new Error(data.error ?? `Draft failed (${res.status})`);
      }
      const json = (await res.json()) as {
        reportId: string;
        draft: { title: string; draft_text: string };
        references: ReportReferenceSet;
      };
      props.onDraft?.({
        reportId: json.reportId,
        title: json.draft.title,
        body: json.draft.draft_text,
        references: json.references,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={busy}
        aria-label={`Draft ${props.reportType} report`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Draft {props.reportType}
      </Button>
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
