/**
 * Feedback Email Relay
 *
 * Dumb relay: receives pre-analyzed feedback from the Electron client and
 * sends it as an email via Resend. All log analysis happens on-device via
 * Ollama — the backend never touches Anthropic or any LLM.
 */

import { Router, Request, Response } from "express";
import { Resend } from "resend";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { feedbackLimiter } from "../middleware/rateLimiter.js";
import { config } from "../../../config.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import { sanitizeFeedbackLogs } from "../../shared-infra/lib/feedback-log-sanitize.js";
import {
  fetchBackendLogsForFeedbackUnauth,
  fetchBackendLogsForFeedbackUser,
} from "../../shared-infra/services/railway-logs.service.js";

const logger = createLogger({ context: "feedback" });
const router = Router();

const resend = config.resend.apiKey ? new Resend(config.resend.apiKey) : null;

const FEEDBACK_CLIENT_LOG_MAX_LINES = 10_000;

function tailLogLines(text: string, maxLines: number): string {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(-maxLines).join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handleFeedback(req: Request, res: Response, options: { unauth: boolean }) {
  try {
    const {
      message,
      mainLogs,
      rendererLogs,
      logs,
      logAnalysis: clientLogAnalysis,
      ollamaDiagnostics,
      userEmail,
      userName,
    } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Feedback message is required" });
      return;
    }

    if (!resend) {
      logger.warn("Resend not configured — feedback email skipped");
      res.json({ success: true, warning: "Email service not configured" });
      return;
    }

    res.json({ success: true });

    const senderName = userName || "Unknown User";
    const senderEmail = userEmail || "unknown";
    const timestamp = new Date().toISOString();

    const mainRaw =
      typeof mainLogs === "string"
        ? tailLogLines(mainLogs, FEEDBACK_CLIENT_LOG_MAX_LINES)
        : typeof logs === "string"
          ? tailLogLines(logs, FEEDBACK_CLIENT_LOG_MAX_LINES)
          : "";
    const rendererRaw =
      typeof rendererLogs === "string"
        ? tailLogLines(rendererLogs, FEEDBACK_CLIENT_LOG_MAX_LINES)
        : "";

    const mainSanitized = sanitizeFeedbackLogs(mainRaw);
    const rendererSanitized = sanitizeFeedbackLogs(rendererRaw);

    let serverLogsRaw = "";
    if (options.unauth) {
      try {
        serverLogsRaw = await fetchBackendLogsForFeedbackUnauth();
      } catch (err) {
        logger.warn({ error: String(err) }, "Server log fetch failed (unauth)");
      }
    } else if (req.userId) {
      try {
        serverLogsRaw = await fetchBackendLogsForFeedbackUser({ userId: req.userId });
      } catch (err) {
        logger.warn({ error: String(err), userId: req.userId }, "Server log fetch failed");
      }
    }
    const serverSanitized = sanitizeFeedbackLogs(serverLogsRaw);

    const logAnalysis = typeof clientLogAnalysis === "string" ? clientLogAnalysis.trim() : "";
    const diagnostics = typeof ollamaDiagnostics === "string" ? ollamaDiagnostics.trim() : "";

    const isProdFeedback = config.nodeEnv === "production";
    const subjectTag = isProdFeedback ? "[Feedback]" : "[Feedback] [Dev]";
    const subject = `${subjectTag} from ${senderName} — ${message.trim().slice(0, 60)}`;

    const devBanner = !isProdFeedback
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:collapse;">
          <tr>
            <td style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:14px 16px;">
              <p style="margin:0;font-size:13px;color:#78350f;font-weight:700;">Dev</p>
              <p style="margin:6px 0 0;font-size:12px;color:#92400e;line-height:1.55;">Sent from a non-production server (Mitable-dev). Treat as internal testing.</p>
            </td>
          </tr>
        </table>`
      : "";

    const emailSignature = !isProdFeedback
      ? `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.55;">— <strong style="color:#0f172a;">Mitable-dev</strong><br/>Development feedback · not from production</p>`
      : `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;">— Mitable</p>`;

    const analysisSection = logAnalysis
      ? `<h3 style="margin:22px 0 10px;font-size:14px;font-weight:600;color:#0f172a;">Log analysis (on-device, Ollama)</h3>
         <div style="background-color:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;">
           <pre style="margin:0;white-space:pre-wrap;line-height:1.5;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#e2e8f0;">${escapeHtml(logAnalysis)}</pre>
         </div>`
      : "";

    const diagnosticsSection = diagnostics
      ? `<h3 style="margin:22px 0 10px;font-size:14px;font-weight:600;color:#0f172a;">Ollama diagnostics</h3>
         <div style="background-color:#1e1b2e;border:1px solid #312e81;border-radius:8px;padding:16px;">
           <pre style="margin:0;white-space:pre-wrap;line-height:1.5;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#c4b5fd;">${escapeHtml(diagnostics)}</pre>
         </div>`
      : "";

    const htmlBody = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="background-color:#f1f5f9;border-collapse:collapse;">
  <tr>
    <td style="padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
        <tr>
          <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
            ${devBanner}
            <h2 style="margin:0 0 18px;font-size:20px;font-weight:600;color:#0f172a;">App Feedback</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
              <tr>
                <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;">
                  <span style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">From</span>
                  <span style="display:block;margin-top:4px;font-size:14px;color:#0f172a;line-height:1.4;">${escapeHtml(senderName)} <span style="color:#475569;">(${escapeHtml(senderEmail)})</span></span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;">
                  <span style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">User ID</span>
                  <span style="display:block;margin-top:4px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#0f172a;word-break:break-all;">${escapeHtml(req.userId || "unknown")}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 14px;">
                  <span style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Time</span>
                  <span style="display:block;margin-top:4px;font-size:14px;color:#0f172a;">${escapeHtml(timestamp)}</span>
                </td>
              </tr>
            </table>

            <h3 style="margin:22px 0 10px;font-size:14px;font-weight:600;color:#0f172a;">User message</h3>
            <div style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
              <p style="margin:0;white-space:pre-wrap;line-height:1.6;font-size:14px;color:#0f172a;">${escapeHtml(message.trim())}</p>
            </div>

            ${analysisSection}
            ${diagnosticsSection}

            ${
              mainSanitized.trim() || rendererSanitized.trim()
                ? '<p style="margin:16px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Attachments when present: <strong>main process</strong> (main.log, up to 10k lines) and <strong>renderer</strong> (renderer.log / DevTools, up to 10k lines), separate files. Sensitive patterns redacted.</p>'
                : ""
            }
            ${serverSanitized ? '<p style="margin:8px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Server log excerpt (local dev capture or Railway in prod, user-scoped) attached when present.</p>' : ""}
            ${emailSignature}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
    `;

    const attachments: { filename: string; content: Buffer }[] = [];
    if (mainSanitized.trim()) {
      attachments.push({
        filename: `mitable-main-process-${Date.now()}.txt`,
        content: Buffer.from(mainSanitized, "utf-8"),
      });
    }
    if (rendererSanitized.trim()) {
      attachments.push({
        filename: `mitable-renderer-${Date.now()}.txt`,
        content: Buffer.from(rendererSanitized, "utf-8"),
      });
    }
    if (serverSanitized) {
      attachments.push({
        filename: `mitable-server-logs-${Date.now()}.txt`,
        content: Buffer.from(serverSanitized, "utf-8"),
      });
    }

    const feedbackTo = config.feedback.emailTo || "mikun@mitable.ai";
    const feedbackCc = config.feedback.emailCcList;

    const { error } = await resend.emails.send({
      from: config.resend.fromAddress,
      to: feedbackTo,
      ...(feedbackCc.length > 0 ? { cc: feedbackCc } : {}),
      subject,
      html: htmlBody,
      attachments,
    });

    if (error) {
      logger.error({ error }, "Failed to send feedback email");
    } else {
      logger.info({ userId: req.userId }, "Feedback email sent");
    }
  } catch (err) {
    logger.error({ error: String(err) }, "Feedback route error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

router.post("/", requireAuth, feedbackLimiter, async (req: Request, res: Response) => {
  await handleFeedback(req, res, { unauth: false });
});

router.post("/unauth", optionalAuth, feedbackLimiter, async (req: Request, res: Response) => {
  await handleFeedback(req, res, { unauth: true });
});

export default router;
