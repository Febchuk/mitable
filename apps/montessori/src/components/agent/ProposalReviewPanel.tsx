"use client";

import * as React from "react";
import {
    Calendar,
    Check,
    CheckCircle2,
    FileText,
    Quote,
    Target,
    Trash2,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmCapture, type ConfirmCaptureResult } from "@/lib/query/montessoriMutations";
import type {
    AttendanceProposal,
    MasteryLevel,
    ObservationProposal,
    ProposedUpdate,
    ProposedUpdatesEnvelope,
    ReportDraftProposal,
} from "@/types/proposed-updates";

/**
 * ProposalReviewPanel — renders the proposals from a /interpret
 * envelope as editable cards and submits the (possibly edited) set
 * to /confirm. The teacher always reviews before anything writes:
 * the agent never persists on its own.
 *
 * Layout per turn:
 *   - one card per proposal, with kind-specific editors
 *   - per-card "remove" button (drop a proposal without rejecting
 *     the rest)
 *   - sticky-ish footer with "Save N updates" + "Discard"
 *   - terminal "Saved" / "Discarded" state once the panel resolves
 *
 * The panel is keyed by sourceMessageId so the agent's reply bubble
 * can host one panel per turn — past turns stay rendered with their
 * resolved status when the conversation scrolls back.
 */

export interface ProposalReviewPanelProps {
    threadId: string;
    sourceMessageId: string;
    envelope: ProposedUpdatesEnvelope;
    /** Called after a successful /confirm so the parent can react
     *  (e.g. invalidate caches in 4.2). */
    onApplied?: (result: ConfirmCaptureResult) => void;
}

type PanelStatus = "editing" | "saving" | "saved" | "discarded" | "error";

export function ProposalReviewPanel({
    threadId,
    sourceMessageId,
    envelope,
    onApplied,
}: ProposalReviewPanelProps) {
    const [proposals, setProposals] = React.useState<ProposedUpdate[]>(envelope.proposals);
    const [status, setStatus] = React.useState<PanelStatus>("editing");
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const confirm = useConfirmCapture();

    const updateProposal = React.useCallback(
        (proposalId: string, patch: Partial<ProposedUpdate>) => {
            setProposals((prev) =>
                prev.map((p) =>
                    p.proposalId === proposalId ? ({ ...p, ...patch } as ProposedUpdate) : p
                )
            );
        },
        []
    );

    const removeProposal = React.useCallback((proposalId: string) => {
        setProposals((prev) => prev.filter((p) => p.proposalId !== proposalId));
    }, []);

    const handleSave = React.useCallback(async () => {
        if (proposals.length === 0) return;
        setStatus("saving");
        setErrorMessage(null);
        try {
            const result = await confirm.mutateAsync({
                threadId,
                sourceMessageId,
                envelope: { ...envelope, proposals },
            });
            setStatus("saved");
            onApplied?.(result);
        } catch (err) {
            setStatus("error");
            setErrorMessage(
                (err as Error)?.message ?? "Couldn't save these updates. Please try again."
            );
        }
    }, [confirm, threadId, sourceMessageId, envelope, proposals, onApplied]);

    const handleDiscard = React.useCallback(() => {
        setStatus("discarded");
    }, []);

    if (status === "saved") {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-status-success">
                <CheckCircle2 className="h-4 w-4" />
                Saved {envelope.proposals.length} update
                {envelope.proposals.length === 1 ? "" : "s"}.
            </div>
        );
    }

    if (status === "discarded") {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-stroke-subtle bg-canvas-base px-3 py-2 text-sm text-ink-tertiary">
                <X className="h-4 w-4" />
                Discarded — nothing was saved.
            </div>
        );
    }

    const isReadOnly = status === "saving";

    return (
        <div className="space-y-2">
            {proposals.length === 0 ? (
                <div className="rounded-lg border border-stroke-subtle bg-canvas-base px-3 py-2 text-sm text-ink-tertiary">
                    All proposals removed. Discard to clear, or capture again.
                </div>
            ) : (
                proposals.map((proposal) => (
                    <ProposalCard
                        key={proposal.proposalId}
                        proposal={proposal}
                        readOnly={isReadOnly}
                        onChange={(patch) => updateProposal(proposal.proposalId, patch)}
                        onRemove={() => removeProposal(proposal.proposalId)}
                    />
                ))
            )}

            {errorMessage && (
                <div className="text-sm text-status-error">{errorMessage}</div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-xs text-ink-tertiary">
                    {proposals.length} update{proposals.length === 1 ? "" : "s"} ready
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleDiscard}
                        disabled={isReadOnly}
                    >
                        Discard
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSave()}
                        disabled={isReadOnly || proposals.length === 0}
                    >
                        <Check className="h-4 w-4 mr-1.5" />
                        {status === "saving"
                            ? "Saving…"
                            : `Save ${proposals.length} update${proposals.length === 1 ? "" : "s"}`}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Per-card dispatch ──────────────────────────────────────────────

interface ProposalCardProps {
    proposal: ProposedUpdate;
    readOnly: boolean;
    onChange: (patch: Partial<ProposedUpdate>) => void;
    onRemove: () => void;
}

function ProposalCard({ proposal, readOnly, onChange, onRemove }: ProposalCardProps) {
    return (
        <div className="rounded-lg border border-stroke-subtle bg-canvas-base p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                    <ProposalIcon kind={proposal.kind} />
                    <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-primary">
                            {proposal.summary}
                        </div>
                        <ProposalSubtitle proposal={proposal} />
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={readOnly}
                    className="text-ink-tertiary hover:text-ink-primary disabled:opacity-40"
                    aria-label="Remove this proposal"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <ProposalEditor proposal={proposal} readOnly={readOnly} onChange={onChange} />

            {proposal.sourceQuote && (
                <div className="flex items-start gap-1.5 rounded-md bg-canvas-overlay/60 px-2 py-1.5 text-xs text-ink-tertiary">
                    <Quote className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="italic">"{proposal.sourceQuote}"</span>
                </div>
            )}
        </div>
    );
}

function ProposalIcon({ kind }: { kind: ProposedUpdate["kind"] }) {
    const className = "h-4 w-4 mt-0.5 shrink-0 text-accent";
    if (kind === "observation") return <Target className={className} />;
    if (kind === "attendance") return <Calendar className={className} />;
    return <FileText className={className} />;
}

function ProposalSubtitle({ proposal }: { proposal: ProposedUpdate }) {
    if (proposal.kind === "observation") {
        return (
            <div className="text-xs text-ink-tertiary">
                {proposal.studentName} · {proposal.domainName} → {proposal.topicName}
            </div>
        );
    }
    if (proposal.kind === "attendance") {
        return (
            <div className="text-xs text-ink-tertiary">
                {proposal.studentName} · {proposal.date}
            </div>
        );
    }
    return (
        <div className="text-xs text-ink-tertiary">
            {proposal.studentName} · {labelForReportType(proposal.type)}
        </div>
    );
}

function labelForReportType(type: ReportDraftProposal["type"]): string {
    return type === "end-of-term" ? "End-of-term report" : "Activity update";
}

// ─── Editors ────────────────────────────────────────────────────────

function ProposalEditor({
    proposal,
    readOnly,
    onChange,
}: {
    proposal: ProposedUpdate;
    readOnly: boolean;
    onChange: (patch: Partial<ProposedUpdate>) => void;
}) {
    if (proposal.kind === "observation") {
        return (
            <ObservationEditor
                proposal={proposal}
                readOnly={readOnly}
                onChange={(patch) => onChange(patch as Partial<ProposedUpdate>)}
            />
        );
    }
    if (proposal.kind === "attendance") {
        return (
            <AttendanceEditor
                proposal={proposal}
                readOnly={readOnly}
                onChange={(patch) => onChange(patch as Partial<ProposedUpdate>)}
            />
        );
    }
    return (
        <ReportDraftEditor
            proposal={proposal}
            readOnly={readOnly}
            onChange={(patch) => onChange(patch as Partial<ProposedUpdate>)}
        />
    );
}

function ObservationEditor({
    proposal,
    readOnly,
    onChange,
}: {
    proposal: ObservationProposal;
    readOnly: boolean;
    onChange: (patch: Partial<ObservationProposal>) => void;
}) {
    const levels: { value: MasteryLevel; label: string }[] = [
        { value: "introduced", label: "Introduced" },
        { value: "practising", label: "Practising" },
        { value: "mastered", label: "Mastered" },
    ];
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
                {levels.map((opt) => {
                    const selected = proposal.level === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange({ level: opt.value })}
                            disabled={readOnly}
                            className={
                                "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 " +
                                (selected
                                    ? "border-accent-border bg-accent-bg text-accent"
                                    : "border-stroke-subtle bg-canvas-raised text-ink-secondary hover:text-ink-primary")
                            }
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            <Textarea
                value={proposal.note ?? ""}
                onChange={(e) => onChange({ note: e.target.value || null })}
                disabled={readOnly}
                placeholder="Add a note (optional)…"
                rows={2}
                className="text-sm"
            />
        </div>
    );
}

function AttendanceEditor({
    proposal,
    readOnly,
    onChange,
}: {
    proposal: AttendanceProposal;
    readOnly: boolean;
    onChange: (patch: Partial<AttendanceProposal>) => void;
}) {
    const options: { value: AttendanceProposal["status"]; label: string }[] = [
        { value: "present", label: "Present" },
        { value: "absent", label: "Absent" },
    ];
    return (
        <div className="space-y-2">
            <div className="flex gap-1">
                {options.map((opt) => {
                    const selected = proposal.status === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange({ status: opt.value })}
                            disabled={readOnly}
                            className={
                                "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 " +
                                (selected
                                    ? "border-accent-border bg-accent-bg text-accent"
                                    : "border-stroke-subtle bg-canvas-raised text-ink-secondary hover:text-ink-primary")
                            }
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            <Textarea
                value={proposal.note ?? ""}
                onChange={(e) => onChange({ note: e.target.value || null })}
                disabled={readOnly}
                placeholder="Add a note (optional)…"
                rows={2}
                className="text-sm"
            />
        </div>
    );
}

function ReportDraftEditor({
    proposal,
    readOnly,
    onChange,
}: {
    proposal: ReportDraftProposal;
    readOnly: boolean;
    onChange: (patch: Partial<ReportDraftProposal>) => void;
}) {
    const updateSection = React.useCallback(
        (index: number, narrative: string) => {
            const next = proposal.sections.map((s, i) => (i === index ? { ...s, narrative } : s));
            onChange({ sections: next });
        },
        [proposal.sections, onChange]
    );

    return (
        <div className="space-y-2">
            <div>
                <label className="text-xs text-ink-tertiary mb-1 block">Summary</label>
                <Textarea
                    value={proposal.reportSummary ?? ""}
                    onChange={(e) =>
                        onChange({ reportSummary: e.target.value || null })
                    }
                    disabled={readOnly}
                    placeholder="Top-of-report narrative…"
                    rows={2}
                    className="text-sm"
                />
            </div>
            {proposal.sections.length > 0 && (
                <div className="space-y-2">
                    {proposal.sections.map((section, index) => (
                        <div key={`${section.domainId}-${index}`}>
                            <label className="text-xs text-ink-tertiary mb-1 block">
                                {section.domainName}
                            </label>
                            <Textarea
                                value={section.narrative}
                                onChange={(e) => updateSection(index, e.target.value)}
                                disabled={readOnly}
                                rows={2}
                                className="text-sm"
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
