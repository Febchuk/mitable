"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, Send } from "lucide-react";
import { useIsMobile } from "../child-detail/use-is-mobile";
import { ChatPane, type ChatPaneHandle, type ChatPaneSection } from "./chat-pane";

export interface ReportChatDrawerProps {
  chatPaneRef?: React.RefObject<ChatPaneHandle | null>;
  reportId: string;
  sections: ChatPaneSection[];
  onApplyProposal: (args: { sectionId: string; paragraphId: string; newText: string }) => void;
  onApplyGhostEdits?: (
    edits: Array<{
      sectionId: string;
      ghostEdit: { id: string; html: string; sourceLabel: string };
      messageId: string;
    }>
  ) => void;
  onApplyNewSection?: (args: {
    sectionId: string;
    heading: string;
    paragraphs: { id: string; html: string }[];
    afterSectionId?: string;
    messageId: string;
  }) => void;
  flushPendingSave?: () => Promise<void>;
}

/**
 * Bottom pill + mic on every report.
 *  - Desktop: tapping the pill opens an upward drawer with the full chat history.
 *  - Mobile:  tapping the pill navigates to the full-screen chat route so the
 *             teacher has room to read transcripts and the agent's section edits.
 */
export function ReportChatDrawer(props: ReportChatDrawerProps) {
  const mobile = useIsMobile();
  return mobile ? <MobilePillLauncher reportId={props.reportId} /> : <DesktopDrawer {...props} />;
}

function MobilePillLauncher({ reportId }: { reportId: string }) {
  const router = useRouter();
  const goToChat = React.useCallback(
    () => router.push(`/app/reports/${reportId}/chat`),
    [router, reportId]
  );

  return (
    <div className="rd-chat-drawer rd-chat-drawer--mobile" aria-label="Open editing assistant">
      <div className="rd-composer-wrap rd-composer-wrap--drawer">
        <div className="rd-composer rd-composer--pill">
          <button
            type="button"
            className="rd-mic-circle"
            onClick={goToChat}
            aria-label="Record voice note"
          >
            <Mic size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="rd-composer-pill rd-composer-pill--launcher"
            onClick={goToChat}
            aria-label="Ask the editing assistant"
          >
            <span className="rd-composer-pill-placeholder">Ask anything</span>
            <span className="rd-composer-actions" aria-hidden>
              <span className="rd-icon-btn rd-primary">
                <Send size={15} strokeWidth={2.5} />
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DesktopDrawer({
  chatPaneRef,
  reportId,
  sections,
  onApplyProposal,
  onApplyGhostEdits,
  onApplyNewSection,
  flushPendingSave,
}: ReportChatDrawerProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="rd-chat-drawer-scrim"
          aria-label="Close assistant"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        className={`rd-chat-drawer${open ? " rd-chat-drawer--open" : ""}`}
        role="region"
        aria-label="Editing assistant"
      >
        <ChatPane
          ref={chatPaneRef}
          layout="drawer"
          messagesVisible={open}
          onComposerFocus={() => setOpen(true)}
          onCollapse={open ? () => setOpen(false) : undefined}
          reportId={reportId}
          sections={sections}
          onApplyProposal={onApplyProposal}
          onApplyGhostEdits={onApplyGhostEdits}
          onApplyNewSection={onApplyNewSection}
          flushPendingSave={flushPendingSave}
        />
      </div>
    </>
  );
}
