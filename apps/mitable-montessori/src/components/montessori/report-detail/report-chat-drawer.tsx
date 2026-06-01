"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { useIsMobile } from "../child-detail/use-is-mobile";

export interface ReportChatLauncherProps {
  reportId: string;
}

/**
 * Mobile-only launcher for the report editing assistant. Tapping the bottom
 * pill navigates to the full-screen chat route so the teacher has room to read
 * the conversation and the agent's section edits. On desktop the assistant
 * lives in the floating "Ask Mitable" pill (ChatDock), so this renders nothing.
 */
export function ReportChatLauncher({ reportId }: ReportChatLauncherProps) {
  const mobile = useIsMobile();
  const router = useRouter();
  const goToChat = React.useCallback(
    () => router.push(`/app/reports/${reportId}/chat`),
    [router, reportId]
  );

  if (!mobile) return null;

  return (
    <div className="rd-chat-drawer rd-chat-drawer--mobile" aria-label="Open editing assistant">
      <div className="rd-composer-wrap rd-composer-wrap--drawer">
        <div className="rd-composer rd-composer--pill">
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
