"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detokenizeReportText } from "@/lib/reports/detokenize";
import type { ReportReferenceSet } from "@/lib/reports/data-adapter";

export interface ReportReviewProps {
  reportId: string;
  reportType: "daily" | "major";
  initialTitle: string;
  /** Tokenized body — we render de-tokenized in the textarea. */
  initialBody: string;
  references: ReportReferenceSet;
  /** Daily reports owned by the teacher may short-circuit `draft → approved`. */
  canShortCircuit: boolean;
}

type Status = "draft" | "submitted" | "approved" | "rejected";

export function ReportReview(props: ReportReviewProps) {
  const [title, setTitle] = useState(props.initialTitle);
  const [body, setBody] = useState(() => detokenizeReportText(props.initialBody, props.references));
  const [busy, setBusy] = useState<null | "submit" | "approve" | "reject">(null);
  const [status, setStatus] = useState<Status>("draft");
  const [error, setError] = useState<string | null>(null);

  const tokenizedTitle = useMemo(() => props.initialTitle, [props.initialTitle]);

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function handleSubmit() {
    setBusy("submit");
    setError(null);
    try {
      await postJson("/api/v1/reports/submit", { reportId: props.reportId });
      setStatus("submitted");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    setBusy("approve");
    setError(null);
    try {
      await postJson("/api/v1/reports/approve", { reportId: props.reportId });
      setStatus("approved");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    setBusy("reject");
    setError(null);
    try {
      await postJson("/api/v1/reports/changes", {
        reportId: props.reportId,
        notes: "Rejected by teacher review.",
      });
      setStatus("rejected");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-ink/10">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="terracotta">{props.reportType} report</Badge>
          {status !== "draft" ? <Badge variant="sage">{status}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <input
          type="text"
          value={detokenizeReportText(title, props.references)}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-base font-semibold"
          aria-label="Report title"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          aria-label="Report body"
        />
        <p className="text-[11px] text-ink/40">
          Names rendered locally from tokens. Editing here is local; the AI draft above is the
          source of truth for the saved row. (Edits via PATCH endpoint land in Phase 4.)
        </p>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        <details className="text-[11px] text-ink/40">
          <summary>Tokenized title (debug)</summary>
          <pre className="overflow-x-auto whitespace-pre-wrap">{tokenizedTitle}</pre>
        </details>
      </CardContent>
      {status === "draft" ? (
        <CardFooter className="flex-wrap gap-2">
          {props.canShortCircuit ? (
            <Button size="sm" onClick={handleApprove} disabled={busy !== null}>
              <Check className="h-4 w-4" />
              Approve
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={busy !== null}>
              <Send className="h-4 w-4" />
              Submit for review
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleReject} disabled={busy !== null}>
            <X className="h-4 w-4" />
            Reject
          </Button>
          <Button size="sm" variant="outline" disabled>
            <Pencil className="h-4 w-4" />
            Save edits
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
