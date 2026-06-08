"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ChildPicker, type PickerChild } from "./child-picker";
import { MobileTemplateList } from "./template-block";
import { TemplatePreview } from "./template-block";
import {
  buildDefaultReportTemplate,
  isDefaultReportTemplateId,
} from "@/lib/reports/default-template";
import { type NewReportPayload, type ReportTemplate } from "./mock-data";

type CapturedToday = Record<string, { voice: number; photos: number }>;
type Step = 1 | 2;

export function NewReportModal({
  open,
  onClose,
  onSubmit,
  roster,
  capturedToday,
  templates,
  submitting,
  classroomName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: NewReportPayload) => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
  templates: ReportTemplate[];
  submitting?: boolean;
  classroomName: string;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [child, setChild] = React.useState<PickerChild | null>(null);
  const [template, setTemplate] = React.useState<ReportTemplate | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setChild(null);
      setTemplate(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (step === 2 && !template) {
      setTemplate(buildDefaultReportTemplate(classroomName));
    }
  }, [step, template, classroomName]);

  React.useEffect(() => {
    setTemplate((current) => {
      if (!current || !isDefaultReportTemplateId(current.id)) return current;
      const next = buildDefaultReportTemplate(classroomName);
      return current.name === next.name ? current : next;
    });
  }, [classroomName]);

  const canSubmit = !!child && !!template && !submitting;

  const submit = () => {
    if (!child || !template) return;
    onSubmit({
      childId: child.id,
      kind: template.kind,
      templateId: template.id,
    });
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
                    Step 1 of 2 — pick a child from your classroom.
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
                  rosterGroupLabel={classroomName}
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
          ) : (
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
                    Choose a template
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-ink-secondary">
                    Step 2 of 2 — for {child?.name.split(" ")[0]}.
                  </DialogDescription>
                </div>
                <button type="button" className="nr-close tap" onClick={onClose} aria-label="Close">
                  <X size={18} strokeWidth={2} />
                </button>
              </header>
              <div className="nr-modal-body nr-modal-body--template flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="nr-modal-template-scroll scroll-quiet min-h-0 flex-1 overflow-y-auto">
                  <MobileTemplateList
                    selected={template}
                    onPick={setTemplate}
                    templates={templates}
                    child={child!}
                    classroomName={classroomName}
                  />
                </div>
                {template ? (
                  <div className="nr-modal-preview shrink-0 scroll-quiet overflow-y-auto">
                    <TemplatePreview template={template} child={child} locked />
                  </div>
                ) : null}
              </div>
              <footer className="nr-modal-foot">
                <button
                  type="button"
                  className="nr-btn nr-btn-primary"
                  disabled={!canSubmit}
                  onClick={submit}
                >
                  {submitting ? "Starting…" : "Start drafting"}
                  <ArrowRight size={14} strokeWidth={2.5} />
                </button>
              </footer>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
