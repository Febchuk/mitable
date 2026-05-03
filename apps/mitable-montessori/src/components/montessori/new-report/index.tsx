"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useMontessori } from "../store";
import { findChild } from "../data";
import { ToastBus } from "../primitives";
import { useIsMobile } from "../child-detail/use-is-mobile";
import { NewReportSheet } from "./new-report-sheet";
import { NewReportMobile } from "./new-report-mobile";
import { TEMPLATES, type NewReportPayload } from "./mock-data";
import "./new-report.css";

/** The Plus button on /app/reports — clicking opens the sheet (desktop)
   or the full-screen step flow (mobile). */
export function NewReportTrigger() {
  const [open, setOpen] = React.useState(false);
  const mobile = useIsMobile();
  const router = useRouter();
  const { createReport } = useMontessori();

  const onSubmit = React.useCallback(
    (payload: NewReportPayload) => {
      const child = findChild(payload.childId);
      const template = payload.templateId
        ? (TEMPLATES.find((t) => t.id === payload.templateId) ?? null)
        : null;

      // Build a minimal detail block so the editor renders something
      // immediately. The chat agent will replace this with a real draft
      // when it lands.
      const today = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const detail = template
        ? {
            title: child ? `${child.name.split(" ")[0]} — ${today}` : "New report",
            observer: "Ms. Lena",
            classroom: "Sunflower classroom",
            dayLabel: today,
            savedMeta: "Just created",
            sources: {
              voiceNotes: payload.audio ? 1 : 0,
              photos: payload.notes.length,
              worksheets: 0,
            },
            visibleTo: child
              ? [`${child.name.split(" ")[0]}'s parents`, "Lead teacher"]
              : ["Lead teacher"],
            sections: template.sections.map((heading, i) => ({
              id: `s-${i}-${heading.toLowerCase().replace(/\s+/g, "-")}`,
              heading,
              paragraphs: [{ id: `p-${i}-1`, html: "" }],
            })),
          }
        : undefined;

      const id = createReport({ childId: payload.childId, kind: payload.kind, detail });
      ToastBus.push({
        message: child
          ? `Drafting ${payload.kind.toLowerCase()} report for ${child.name.split(" ")[0]}…`
          : "Drafting new report…",
      });
      setOpen(false);
      router.push(`/app/reports/${id}`);
    },
    [createReport, router]
  );

  return (
    <>
      <button
        type="button"
        className="tap"
        onClick={() => setOpen(true)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: 0,
          background: "var(--color-terracotta)",
          color: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 10px rgba(196,106,79,0.25)",
          cursor: "pointer",
        }}
        aria-label="New report"
      >
        <Plus size={18} strokeWidth={1.5} />
      </button>

      {!mobile && <NewReportSheet open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />}
      {mobile && <NewReportMobile open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />}
    </>
  );
}
