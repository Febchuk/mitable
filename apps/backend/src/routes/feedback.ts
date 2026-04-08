import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { feedbackLimiter } from "../middleware/rateLimiter.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { sanitizeFeedbackLogs } from "../lib/feedback-log-sanitize.js";
import {
  fetchBackendLogsForFeedbackUnauth,
  fetchBackendLogsForFeedbackUser,
} from "../services/railway-logs.service.js";

const logger = createLogger({ context: "feedback" });
const router = Router();

const resend = config.resend.apiKey ? new Resend(config.resend.apiKey) : null;
const anthropic = config.anthropic.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null;

const MAX_AGENT_TURNS = 8;

const SEARCH_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    query: {
      type: "string",
      description: "Case-insensitive keyword or phrase to search for in this log source",
    },
  },
  required: ["query"],
};

const RANGE_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    start_line: { type: "number", description: "Start line number (1-based)" },
    end_line: { type: "number", description: "End line number (1-based, inclusive)" },
  },
  required: ["start_line", "end_line"],
};

function buildFeedbackLogTools(hasElectron: boolean, hasServer: boolean): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  if (hasElectron) {
    tools.push(
      {
        name: "search_electron_logs",
        description:
          "Search the user's Mitable desktop (Electron) log tail for a keyword or phrase. Up to 15 hits with 2 lines of context each. Use for client-side errors, IPC, renderer issues.",
        input_schema: SEARCH_TOOL_SCHEMA,
      },
      {
        name: "get_electron_log_range",
        description:
          "Fetch a 1-based line range from the Electron log tail (max 50 lines). Use after search_electron_logs to expand context.",
        input_schema: RANGE_TOOL_SCHEMA,
      }
    );
  }
  if (hasServer) {
    tools.push(
      {
        name: "search_server_logs",
        description:
          "Search backend API log excerpt attached to this report. In production these come from Railway; in local dev they come from this running server. Use for API errors, 5xx, auth, routes.",
        input_schema: SEARCH_TOOL_SCHEMA,
      },
      {
        name: "get_server_log_range",
        description:
          "Fetch a line range from the backend log excerpt (max 50 lines). Use after search_server_logs.",
        input_schema: RANGE_TOOL_SCHEMA,
      }
    );
  }
  return tools;
}

function searchLogLines(logLines: string[], queryRaw: string): string {
  const query = queryRaw.toLowerCase();
  if (!query) return "No query provided.";

  const matches: string[] = [];
  const contextRadius = 2;
  const maxMatches = 15;

  for (let i = 0; i < logLines.length && matches.length < maxMatches; i++) {
    if (logLines[i].toLowerCase().includes(query)) {
      const start = Math.max(0, i - contextRadius);
      const end = Math.min(logLines.length - 1, i + contextRadius);
      const hitLineIndexInSlice = i - start;
      const snippet = logLines
        .slice(start, end + 1)
        .map((l, idx) => `${start + idx + 1}| ${idx === hitLineIndexInSlice ? ">>> " : "    "}${l}`)
        .join("\n");
      matches.push(snippet);
    }
  }

  if (matches.length === 0) return `No matches found for "${queryRaw}".`;
  return `Found ${matches.length} match(es) for "${queryRaw}":\n\n${matches.join("\n---\n")}`;
}

function rangeLogLines(logLines: string[], input: Record<string, unknown>): string {
  const start = Math.max(1, Number(input.start_line) || 1);
  const end = Math.min(logLines.length, Number(input.end_line) || start + 20);
  const clamped = Math.min(end - start + 1, 50);
  return logLines
    .slice(start - 1, start - 1 + clamped)
    .map((l, i) => `${start + i}| ${l}`)
    .join("\n");
}

function executeFeedbackLogTool(
  toolName: string,
  input: Record<string, unknown>,
  electronLines: string[],
  serverLines: string[]
): string {
  if (toolName === "search_electron_logs") {
    if (electronLines.length === 0) return "No Electron logs in this report.";
    return searchLogLines(electronLines, String(input.query || ""));
  }
  if (toolName === "get_electron_log_range") {
    if (electronLines.length === 0) return "No Electron logs in this report.";
    return rangeLogLines(electronLines, input);
  }
  if (toolName === "search_server_logs") {
    if (serverLines.length === 0) return "No server logs in this report.";
    return searchLogLines(serverLines, String(input.query || ""));
  }
  if (toolName === "get_server_log_range") {
    if (serverLines.length === 0) return "No server logs in this report.";
    return rangeLogLines(serverLines, input);
  }
  return "Unknown tool.";
}

// ── LLM agent loop ─────────────────────────────────────────────────────────

async function analyzeFeedbackLogs(
  feedbackMessage: string,
  rawElectronLogs: string,
  rawServerLogs: string
): Promise<string> {
  const electronLines = rawElectronLogs
    ? rawElectronLogs.split("\n").filter((l) => l.length > 0)
    : [];
  const serverLines = rawServerLogs ? rawServerLogs.split("\n").filter((l) => l.length > 0) : [];

  const hasElectron = electronLines.length > 0;
  const hasServer = serverLines.length > 0;

  if (!hasElectron && !hasServer) {
    return "";
  }

  if (!anthropic) {
    return "LLM not configured — raw logs attached instead.";
  }

  const tools = buildFeedbackLogTools(hasElectron, hasServer);
  if (tools.length === 0) {
    return "";
  }

  const sourceSummary = [
    hasElectron
      ? `Electron (desktop) log tail: ${electronLines.length} lines, numbered 1–${electronLines.length}.`
      : null,
    hasServer
      ? `Backend (Node API) logs for this user: ${serverLines.length} lines, numbered 1–${serverLines.length} (local dev: captured from this process; production: Railway).`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You are a log analysis assistant for Mitable (Electron desktop + Node API).
A user submitted feedback about an issue. You have these sources:
${sourceSummary}

Your job:
1. Read the user's feedback and infer which routes, features, or error messages to search for.
2. Use the search_* tools to find relevant errors, warnings, HTTP status lines, stack traces, and user-scoped request logs.
3. Use get_*_log_range when you need more context around a hit.
4. Produce ONE short report with sections "Electron" and/or "Server" only when that source had relevant findings.

Rules:
- Prefer lines that clearly relate to the feedback (paths, error text, session/auth).
- Include timestamps and line numbers for each snippet.
- If a source has nothing useful, say so in one line for that section.
- Keep the full report under 100 lines. Plain text only, no markdown.
- Do not invent log lines; only report what the tools return.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `User feedback: "${feedbackMessage}"\n\nUse the tools to investigate, then write the report.`,
    },
  ];

  try {
    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        return textBlock?.text || "No analysis produced.";
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = executeFeedbackLogTool(
              block.name,
              block.input as Record<string, unknown>,
              electronLines,
              serverLines
            );
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      break;
    }

    return "Log analysis did not complete within turn limit.";
  } catch (err) {
    logger.error({ error: String(err) }, "Log analysis agent failed");
    return "Log analysis failed — raw logs attached as fallback.";
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

const FEEDBACK_CLIENT_LOG_MAX_LINES = 10_000;

function tailLogLines(text: string, maxLines: number): string {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(-maxLines).join("\n");
}

async function handleFeedback(req: Request, res: Response, options: { unauth: boolean }) {
  try {
    const { message, mainLogs, rendererLogs, logs, userEmail, userName } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Feedback message is required" });
      return;
    }

    if (!resend) {
      logger.warn("Resend not configured — feedback email skipped");
      res.json({ success: true, warning: "Email service not configured" });
      return;
    }

    // Respond immediately — analysis + email happens in background
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

    const clientBundleForAgent = [
      mainSanitized.trim() && `=== Main process (main.log) ===\n${mainSanitized.trim()}`,
      rendererSanitized.trim() &&
        `=== Renderer (renderer.log / DevTools) ===\n${rendererSanitized.trim()}`,
    ]
      .filter(Boolean)
      .join("\n\n");

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

    let logAnalysis = "";
    if (clientBundleForAgent.length > 0 || serverSanitized.length > 0) {
      logAnalysis = await analyzeFeedbackLogs(
        message.trim(),
        clientBundleForAgent,
        serverSanitized
      );
    }

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

    // Light, high-contrast HTML: many clients ignore outer dark backgrounds but keep light text (invisible on white).
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

            ${
              logAnalysis
                ? `<h3 style="margin:22px 0 10px;font-size:14px;font-weight:600;color:#0f172a;">Log analysis (AI-curated)</h3>
            <div style="background-color:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;">
              <pre style="margin:0;white-space:pre-wrap;line-height:1.5;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#e2e8f0;">${escapeHtml(logAnalysis)}</pre>
            </div>`
                : ""
            }

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
      logger.info({ userId: req.userId }, "Feedback email sent with log analysis");
    }
  } catch (err) {
    logger.error({ error: String(err) }, "Feedback route error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// Authenticated feedback: includes user-scoped server logs + permissions context.
router.post("/", requireAuth, feedbackLimiter, async (req: Request, res: Response) => {
  await handleFeedback(req, res, { unauth: false });
});

// Unauthenticated feedback (login / register): no JWT required.
// Still attaches Electron logs; server logs are a generic Railway excerpt (no userId filter).
router.post("/unauth", optionalAuth, feedbackLimiter, async (req: Request, res: Response) => {
  await handleFeedback(req, res, { unauth: true });
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default router;
