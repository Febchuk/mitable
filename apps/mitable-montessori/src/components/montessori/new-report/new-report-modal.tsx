"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ChildPicker, type PickerChild } from "./child-picker";
import { IncidentCaptureStep } from "./incident-capture-step";
import { ReportTypePicker } from "./report-type-picker";
import { buildBuiltinReportTemplateId } from "@/lib/reports/default-template";
import { type NewReportPayload, type ReportKind } from "./mock-data";

type CapturedToday = Record<string, { voice: number; photos: number }>;
type Step = 1 | 2 | 3;

export function NewReportModal({
  open,
  onClose,
  onSubmit,
  roster,
  capturedToday,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: NewReportPayload) => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
  submitting?: boolean;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [child, setChild] = React.useState<PickerChild | null>(null);
  const [reportKind, setReportKind] = React.useState<ReportKind | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setChild(null);
      setReportKind(null);
    }
  }, [open]);

  const submitDailyOrTerm = () => {
    if (!child || !reportKind || reportKind === "Incident") return;
    onSubmit({
      childId: child.id,
      kind: reportKind,
      templateId: buildBuiltinReportTemplateId(reportKind),
    });
  };

  const submitIncident = (transcript: string) => {
    if (!child) return;
    onSubmit({
      childId: child.id,
      kind: "Incident",
      templateId: buildBuiltinReportTemplateId("Incident"),
      incidentTranscript: transcript,
    });
  };

  const onTypePicked = (kind: ReportKind) => {
    setReportKind(kind);
    if (kind === "Incident") {
      setStep(3);
      return;
    }
    if (child) {
      onSubmit({
        childId: child.id,
        kind,
        templateId: buildBuiltinReportTemplateId(kind),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="nr-modal-dialog flex h-[min(90vh,840px)] max-h-[90vh] w-[min(94vw,640px)] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-2xl border-ink/10 bg-canvas p-0 shadow-[0_24px_64px_rgba(31,28,24,0.14)]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="nr-modal-inner flex min-h-0 flex-1 flex-col">
          {step === 1 ? (
            <>
              <header className="nr-modal-head">
                <div className="nr-modal-head-text">
                  <DialogTitle className="font-display text-[1.35rem] font-medium leading-snug text-ink">
                    Start a new report
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-ink-secondary">
                    Step 1 of 2 — pick a child.
                  </DialogDescription>
                </div>
                <button type="button" className="nr-close tap" onClick={onClose} aria-label="Close">
                  <X size={18} strokeWidth={2} />
                </button>
              </header>
              <div className="nr-modal-body nr-modal-body--child scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
                <ChildPicker
                  layout="list"
                  value={child}
                  onChange={setChild}
                  roster={roster}
                  capturedToday={capturedToday}
                />
              </div>
              <footer className="nr-modal-foot">
                <button type="button" className="nr-btn nr-btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="nr-btn nr-btn-primary"
                  disabled={!child}
                  onClick={() => child && setStep(2)}
                >
                  Continue
                  <ArrowRight size={14} strokeWidth={2.5} />
                </button>
              </footer>
            </>
          ) : step === 2 ? (
            <>
              <header className="nr-modal-head nr-modal-head--back">
                <button
                  type="button"
                  className="nr-modal-back tap"
                  onClick={() => setStep(1)}
                  aria-label="Back to child selection"
                >
                  <ArrowLeft size={16} strokeWidth={2} />
                  <span>Back</span>
                </button>
                <div className="nr-modal-head-text">
                  <DialogTitle className="font-display text-[1.35rem] font-medium leading-snug text-ink">
                    Report type
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-ink-secondary">
                    For {child?.name.split(" ")[0]} — we&rsquo;ll pull progress from their class.
                  </DialogDescription>
                </div>
                <button type="button" className="nr-close tap" onClick={onClose} aria-label="Close">
                  <X size={18} strokeWidth={2} />
                </button>
              </header>
              <div className="nr-modal-body nr-modal-body--template scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
                <ReportTypePicker selected={reportKind} onPick={onTypePicked} />
              </div>
              <footer className="nr-modal-foot">
                <button
                  type="button"
                  className="nr-btn nr-btn-primary"
                  disabled={!reportKind || reportKind === "Incident" || submitting}
                  onClick={submitDailyOrTerm}
                >
                  {submitting ? "Starting…" : "Start report"}
                  <ArrowRight size={14} strokeWidth={2.5} />
                </button>
              </footer>
            </>
          ) : (
            <IncidentCaptureStep
              childFirstName={child?.name.split(" ")[0] ?? "this child"}
              onBack={() => setStep(2)}
              onContinue={submitIncident}
              submitting={submitting}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
