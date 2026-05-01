import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, CircleHelp } from "lucide-react";
import { useUser } from "../../../context/UserContext";
import { authService } from "../../../services/authService";
import { API_BASE_URL } from "../../../lib/config";
import { flushRendererLogsPending } from "../../../../../lib/feedback-log-buffer";

export type FeedbackAnonymousSource = "login" | "register";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, email "From" uses this context instead of the signed-in user (login / register screens). */
  anonymousSource?: FeedbackAnonymousSource;
}

const ANONYMOUS_SOURCE_LABEL: Record<FeedbackAnonymousSource, string> = {
  login: "user at login page",
  register: "user at register page",
};

export default function FeedbackDialog({
  open,
  onOpenChange,
  anonymousSource,
}: FeedbackDialogProps) {
  const { user } = useUser();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async () => {
    if (!message.trim() || status === "sending") return;
    setStatus("sending");

    try {
      let mainLogs = "";
      let rendererLogs = "";

      flushRendererLogsPending();

      try {
        const logResult = await window.consoleAPI?.getElectronLogs();
        if (logResult?.success) {
          mainLogs = (logResult.logs ?? "").trim();
          rendererLogs = (logResult.rendererLogs ?? "").trim();
        } else if (logResult && !logResult.success && logResult.error) {
          mainLogs = `(main process log unavailable: ${logResult.error})`;
        }
      } catch (e) {
        mainLogs = `(client logs unavailable: ${String(e)})`;
      }

      // Run log analysis locally via Ollama (best-effort)
      let logAnalysis = "";
      let ollamaDiagnostics = "";
      try {
        const analysisResult = await window.consoleAPI?.analyzeLogsLocally({
          message: message.trim(),
          mainLogs,
          rendererLogs,
        });
        if (analysisResult?.success && analysisResult.analysis) {
          logAnalysis = analysisResult.analysis;
        }
        if (analysisResult?.diagnostics) {
          ollamaDiagnostics = analysisResult.diagnostics;
        }
      } catch {
        ollamaDiagnostics = "analyzeLogsLocally IPC call threw";
      }

      const token = authService.getAccessToken();
      const fromLoginOrRegister = anonymousSource ? ANONYMOUS_SOURCE_LABEL[anonymousSource] : null;
      const resolvedUserName = fromLoginOrRegister
        ? fromLoginOrRegister
        : user?.name || user?.firstName || "Unknown";
      const resolvedUserEmail = fromLoginOrRegister ? "unauthenticated" : user?.email || "unknown";

      // Persist locally + fire-and-forget email via main process
      const result = await window.consoleAPI?.submitFeedback({
        message: message.trim(),
        logAnalysis,
        ollamaDiagnostics,
        mainLogs,
        rendererLogs,
        userName: resolvedUserName,
        userEmail: resolvedUserEmail,
        token: token ?? null,
        apiBaseUrl: API_BASE_URL,
        isAnonymous: !!anonymousSource,
      });

      if (!result?.success) throw new Error(result?.error || "Failed to save");
      setStatus("sent");
      setTimeout(() => {
        onOpenChange(false);
        setMessage("");
        setStatus("idle");
      }, 3200);
    } catch {
      setStatus("error");
    }
  };

  const handleClose = (val: boolean) => {
    if (status === "sending") return;
    onOpenChange(val);
    if (!val) {
      setMessage("");
      setStatus("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[440px] p-0"
        style={{
          background: "var(--bg-base)",
          border: "var(--border-subtle)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <DialogHeader style={{ padding: "20px 24px 0" }}>
          <DialogTitle
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 16,
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {status === "sent" ? (
              <>Thanks</>
            ) : (
              <>
                <CircleHelp size={18} strokeWidth={1.6} />
                Send Feedback
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {status === "sent" ? (
          <div
            style={{
              padding: "28px 32px 36px",
              textAlign: "center",
              fontFamily: "var(--font-sans)",
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                margin: "0 auto 22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(var(--status-success-rgb), 0.14)",
                border: "2px solid var(--status-success)",
                boxSizing: "border-box",
              }}
            >
              <Check
                size={44}
                strokeWidth={2.5}
                style={{ color: "var(--status-success)" }}
                aria-hidden
              />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 500,
                color: "var(--text-primary)",
                lineHeight: 1.55,
              }}
            >
              We've received your feedback.
            </p>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.55,
              }}
            >
              Thank you for trusting Mitable.
            </p>
            <button
              type="button"
              onClick={() => handleClose(false)}
              style={{
                marginTop: 24,
                padding: "8px 20px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "rgba(var(--ui-rgb), 0.04)",
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <div style={{ padding: "16px 24px 24px" }}>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                margin: "0 0 12px",
                lineHeight: 1.5,
              }}
            >
              Let us know about any issues or slowdowns you're seeing anywhere in the app. We'll
              include technical details automatically to help us debug.
            </p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? What did you expect?"
              rows={5}
              disabled={status === "sending"}
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 100,
                maxHeight: 240,
                padding: "10px 12px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "rgba(var(--ui-rgb), 0.03)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                lineHeight: 1.5,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(var(--mi-accent-rgb, 200,169,96), 0.3)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.1)";
              }}
            />

            {status === "error" && (
              <p style={{ fontSize: 12, color: "var(--status-error)", margin: "8px 0 0" }}>
                Failed to send feedback. Please try again.
              </p>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                onClick={() => handleClose(false)}
                disabled={status === "sending"}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: status === "sending" ? "default" : "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!message.trim() || status === "sending"}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background:
                    !message.trim() || status === "sending"
                      ? "rgba(var(--ui-rgb), 0.06)"
                      : "var(--mi-accent)",
                  color:
                    !message.trim() || status === "sending"
                      ? "var(--text-tertiary)"
                      : "var(--bg-base)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: !message.trim() || status === "sending" ? "default" : "pointer",
                  fontFamily: "var(--font-sans)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "background 0.15s ease",
                }}
              >
                {status === "sending" && <Loader2 size={14} className="animate-spin" />}
                {status === "sending" ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
