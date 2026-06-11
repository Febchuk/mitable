"use client";

import * as React from "react";
import { ArrowRight, LayoutTemplate, X } from "lucide-react";
import { ChildPicker, type PickerChild } from "./child-picker";
import { TemplatePicker, TemplatePreview } from "./template-block";
import {
  defaultReportTemplateForClassroom,
  type DefaultTemplateClassroom,
} from "@/lib/reports/default-template";
import { type NewReportPayload, type ReportTemplate } from "./mock-data";

type CapturedToday = Record<string, { voice: number; photos: number }>;

export function NewReportSheet({
  open,
  onClose,
  onSubmit,
  roster,
  capturedToday,
  templates,
  submitting,
  classroomName = "Classroom",
  teacherClassrooms = [],
  selectedClassroomId = null,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: NewReportPayload) => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
  templates: ReportTemplate[];
  submitting?: boolean;
  classroomName?: string;
  teacherClassrooms?: DefaultTemplateClassroom[];
  selectedClassroomId?: string | null;
}) {
  const [child, setChild] = React.useState<PickerChild | null>(null);
  const [template, setTemplate] = React.useState<ReportTemplate | null>(null);
  // Highlighted template drives the right-side preview. When something is
  // selected, that's the highlight; otherwise hover/focus on a row sets it.
  const [highlight, setHighlight] = React.useState<ReportTemplate | null>(null);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset state whenever the sheet opens
  React.useEffect(() => {
    if (open) {
      setChild(null);
      setTemplate(null);
      setHighlight(null);
    }
  }, [open]);

  if (!open) return null;

  const canStart = !!child && !!template && !submitting;
  const previewed = template ?? highlight;

  const submit = () => {
    if (!child || !template) return;
    onSubmit({
      childId: child.id,
      kind: template.kind,
      templateId: template.id,
    });
  };

  return (
    <>
      <div className="nr-scrim" onClick={onClose} />
      <aside className="nr-sheet" role="dialog" aria-modal="true" aria-labelledby="nr-sheet-title">
        <header className="nr-head">
          <span className="nr-crest">A new report ✿</span>
          <div style={{ marginTop: 4, minWidth: 0 }}>
            <h2 id="nr-sheet-title">Start a report</h2>
            <p>Pick a child and a template — the assistant drafts the empty form for you.</p>
          </div>
          <button type="button" className="nr-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="nr-body nr-body-2col scroll-quiet">
          <div className="nr-body-form">
            <div className="nr-field">
              <div className="nr-field-label">
                <span className="nr-label-cap">Child</span>
                <span className="nr-req">required</span>
              </div>
              <ChildPicker
                layout="list"
                value={child}
                onChange={(c) => {
                  setChild(c);
                  if (!template) {
                    setTemplate(
                      defaultReportTemplateForClassroom(
                        teacherClassrooms,
                        selectedClassroomId,
                        "Daily"
                      )
                    );
                  }
                }}
                roster={roster}
                capturedToday={capturedToday}
              />
            </div>

            <div className="nr-field">
              <div className="nr-field-label">
                <span className="nr-label-cap">Template</span>
                <span className="nr-req">required</span>
              </div>
              <TemplatePicker
                selected={template}
                onPick={setTemplate}
                onHighlight={setHighlight}
                templates={templates}
                classroomName={classroomName}
              />
            </div>
          </div>

          <aside className="nr-body-preview" aria-label="Template preview">
            {previewed ? (
              <TemplatePreview template={previewed} child={child} locked={!!template} />
            ) : (
              <div className="nr-preview-placeholder">
                <span className="nr-preview-placeholder-icon" aria-hidden>
                  <LayoutTemplate size={18} strokeWidth={1.6} />
                </span>
                <div className="nr-preview-placeholder-title">Preview the empty form</div>
                <div className="nr-preview-placeholder-sub">
                  Hover or pick a template on the left to see the sections the assistant will fill
                  in.
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="nr-foot nr-foot-simple">
          <div className="nr-foot-meta">
            <NrSummary child={child} template={template} />
          </div>
          <div className="nr-foot-buttons">
            <button type="button" className="nr-btn nr-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="nr-btn nr-btn-primary"
              disabled={!canStart}
              onClick={submit}
            >
              {submitting ? "Starting…" : "Start drafting"}
              <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function NrSummary({
  child,
  template,
}: {
  child: PickerChild | null;
  template: ReportTemplate | null;
}) {
  if (!child || !template) return <span>Pick a child and a template to start.</span>;
  return (
    <span>
      <b>
        {child.name.split(" ")[0]} · {template.kind}
      </b>
      {` · ${template.name}`}
    </span>
  );
}
