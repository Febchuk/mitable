"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { applyApprovedToolCall, rejectProposal } from "@/lib/commands/apply";
import type { DetokenizedToolCall } from "@/lib/tokenize/detokenize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export interface ProposalCardProps {
  proposalId: string;
  call: DetokenizedToolCall;
  display: string;
  schoolId: string;
  userId: string;
  classroomId: string;
  rawTranscript: string | null;
  initialStatus: "proposed" | "approved" | "rejected";
  source?: "text" | "voice" | "photo";
}

export function ProposalCard(props: ProposalCardProps) {
  const [status, setStatus] = useState(props.initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (status !== "proposed" || props.call.kind === "clarification") return;
    setBusy(true);
    setError(null);
    try {
      await applyApprovedToolCall(props.call, {
        schoolId: props.schoolId,
        userId: props.userId,
        classroomId: props.classroomId,
        rawTranscript: props.rawTranscript,
        proposalId: props.proposalId,
        source: props.source ?? "text",
      });
      setStatus("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (status !== "proposed") return;
    setBusy(true);
    setError(null);
    try {
      await rejectProposal(props.proposalId);
      setStatus("rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const toolBadge =
    props.call.kind === "attendance"
      ? "attendance"
      : props.call.kind === "progress"
        ? "progress"
        : props.call.kind === "note"
          ? "note"
          : "clarify";

  return (
    <Card className="border-ink/10 bg-canvas">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <Badge variant="terracotta">{toolBadge}</Badge>
        {status === "approved" ? <Badge variant="sage">approved</Badge> : null}
        {status === "rejected" ? <Badge variant="outline">rejected</Badge> : null}
      </CardHeader>
      <CardContent className="text-sm text-ink">
        <p>{props.display}</p>
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      </CardContent>
      {status === "proposed" && props.call.kind !== "clarification" ? (
        <CardFooter className="gap-2">
          <Button size="sm" onClick={handleApprove} disabled={busy}>
            <Check className="h-4 w-4" />
            Approve
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReject} disabled={busy}>
            <X className="h-4 w-4" />
            Reject
          </Button>
          <Button size="sm" variant="outline" disabled>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
