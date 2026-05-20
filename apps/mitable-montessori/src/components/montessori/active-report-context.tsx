"use client";

import * as React from "react";
import type { ChatPaneSection } from "./report-detail/chat-pane";
import type { ChatGhostEdit, ChatObsRefSuggestedTarget } from "@/lib/schemas/report-chat";

/**
 * Cross-route handle for whichever report the user currently has open in the
 * reports rail view. Lives in app/layout.tsx so the floating ChatDock can
 * surface the report-editor chat without the reports route having to render
 * the chat itself.
 *
 * The reports rail view publishes into this context whenever a report opens,
 * closes, or its sections/handlers change. The dock subscribes via
 * `useActiveReport()` and, when `reportId` is non-null, renders ChatPane wired
 * to these handlers. Otherwise it falls back to the quick-capture ChatThread.
 *
 * The handlers mirror the contract documented at chat-pane.tsx:48-103. They
 * intentionally do not include OCR / mic — those are entirely owned by
 * ChatPane internals.
 */

export interface ActiveReportHandlers {
  onApplyProposal: (args: { sectionId: string; paragraphId: string; newText: string }) => void;
  onApplyGhostEdits: (
    edits: Array<{
      sectionId: string;
      ghostEdit: ChatGhostEdit;
      messageId: string;
    }>
  ) => void;
  onApplyNewSection: (args: {
    sectionId: string;
    heading: string;
    paragraphs: { id: string; html: string }[];
    afterSectionId?: string;
    messageId: string;
  }) => void;
  onPullObservation?: (args: { text: string; suggestedTarget?: ChatObsRefSuggestedTarget }) => void;
  flushPendingSave?: () => Promise<void>;
}

export interface ActiveReportSnapshot {
  reportId: string;
  title: string;
  sections: ChatPaneSection[];
  handlers: ActiveReportHandlers;
}

interface ActiveReportContextValue {
  active: ActiveReportSnapshot | null;
  setActive: (snapshot: ActiveReportSnapshot | null) => void;
}

const ActiveReportContext = React.createContext<ActiveReportContextValue | null>(null);

export function ActiveReportProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<ActiveReportSnapshot | null>(null);
  const value = React.useMemo(() => ({ active, setActive }), [active]);
  return <ActiveReportContext.Provider value={value}>{children}</ActiveReportContext.Provider>;
}

export function useActiveReport(): ActiveReportSnapshot | null {
  const ctx = React.useContext(ActiveReportContext);
  return ctx?.active ?? null;
}

/**
 * Publisher hook for ReportDetail. Pushes the current snapshot into the
 * context on every change without an intermediate null flicker. On unmount
 * (route change, ReportDetail closes) it clears the context so the dock
 * reverts to capture mode.
 */
export function usePublishActiveReport(snapshot: ActiveReportSnapshot | null): void {
  const ctx = React.useContext(ActiveReportContext);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.setActive(snapshot);
  }, [ctx, snapshot]);
  React.useEffect(() => {
    if (!ctx) return;
    return () => {
      ctx.setActive(null);
    };
  }, [ctx]);
}
