import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ context: "feedback" });
const router = Router();

const resend = config.resend.apiKey ? new Resend(config.resend.apiKey) : null;
const anthropic = config.anthropic.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null;

const FEEDBACK_RECIPIENT = "mikun@mitable.ai";
const MAX_AGENT_TURNS = 6;

// ── Tool definitions for the log search agent ──────────────────────────────

const LOG_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_logs",
    description:
      "Search the application logs for lines matching a keyword or phrase. Returns up to 15 matching lines with 2 lines of surrounding context each. Use this to find errors, warnings, or events related to the user's feedback.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Case-insensitive keyword or phrase to search for in the logs",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_log_range",
    description:
      "Get a specific range of log lines by line number. Useful for getting more context around a match found by search_logs.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_line: { type: "number", description: "Start line number (1-based)" },
        end_line: { type: "number", description: "End line number (1-based, inclusive)" },
      },
      required: ["start_line", "end_line"],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────

function executeLogTool(
  toolName: string,
  input: Record<string, unknown>,
  logLines: string[]
): string {
  if (toolName === "search_logs") {
    const query = String(input.query || "").toLowerCase();
    if (!query) return "No query provided.";

    const matches: string[] = [];
    const contextRadius = 2;
    const maxMatches = 15;

    for (let i = 0; i < logLines.length && matches.length < maxMatches; i++) {
      if (logLines[i].toLowerCase().includes(query)) {
        const start = Math.max(0, i - contextRadius);
        const end = Math.min(logLines.length - 1, i + contextRadius);
        const snippet = logLines
          .slice(start, end + 1)
          .map((l, idx) => `${start + idx + 1}| ${idx + contextRadius === i - start ? ">>> " : "    "}${l}`)
          .join("\n");
        matches.push(snippet);
      }
    }

    if (matches.length === 0) return `No matches found for "${input.query}".`;
    return `Found ${matches.length} match(es) for "${input.query}":\n\n${matches.join("\n---\n")}`;
  }

  if (toolName === "get_log_range") {
    const start = Math.max(1, Number(input.start_line) || 1);
    const end = Math.min(logLines.length, Number(input.end_line) || start + 20);
    const clamped = Math.min(end - start + 1, 50);
    return logLines
      .slice(start - 1, start - 1 + clamped)
      .map((l, i) => `${start + i}| ${l}`)
      .join("\n");
  }

  return "Unknown tool.";
}

// ── LLM agent loop ─────────────────────────────────────────────────────────

async function analyzeLogsForFeedback(
  feedbackMessage: string,
  rawLogs: string
): Promise<string> {
  if (!anthropic) return "LLM not configured — raw logs attached instead.";

  const logLines = rawLogs.split("\n");

  const systemPrompt = `You are a log analysis assistant for the Mitable desktop app (Electron + Node backend).
A user submitted feedback about an issue. You have access to the app's recent logs (${logLines.length} lines).

Your job:
1. Read the user's feedback to understand what went wrong.
2. Use the search_logs tool to find relevant errors, warnings, or events.
3. Use get_log_range if you need more context around a match.
4. Produce a SHORT, actionable report with the most relevant log snippets.

Rules:
- Focus on errors ([error], [ERROR], stack traces), warnings, and events related to the feedback.
- Include timestamps and line numbers for each snippet so engineers can find them.
- If you find nothing relevant, say so clearly.
- Keep your final report under 80 lines. Don't include irrelevant logs.
- Format the report as plain text, not markdown.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `User feedback: "${feedbackMessage}"\n\nPlease search the logs and compile a report of relevant entries.`,
    },
  ];

  try {
    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        tools: LOG_TOOLS,
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
            const result = executeLogTool(
              block.name,
              block.input as Record<string, unknown>,
              logLines
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

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { message, logs, userEmail, userName } = req.body;

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

    let logAnalysis = "";
    if (logs && typeof logs === "string" && logs.length > 0) {
      logAnalysis = await analyzeLogsForFeedback(message.trim(), logs);
    }

    const htmlBody = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
        <h2 style="color:#ffffff;margin:0 0 16px;">App Feedback</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:6px 12px 6px 0;color:#a3a3a3;white-space:nowrap;">From:</td>
            <td style="padding:6px 0;color:#e5e5e5;">${escapeHtml(senderName)} (${escapeHtml(senderEmail)})</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;color:#a3a3a3;white-space:nowrap;">User ID:</td>
            <td style="padding:6px 0;color:#e5e5e5;font-family:monospace;font-size:13px;">${escapeHtml(req.userId || "unknown")}</td>
          </tr>
          <tr>
            <td style="padding:6px 12px 6px 0;color:#a3a3a3;white-space:nowrap;">Time:</td>
            <td style="padding:6px 0;color:#e5e5e5;">${timestamp}</td>
          </tr>
        </table>

        <h3 style="color:#ffffff;margin:24px 0 8px;font-size:14px;">User Message</h3>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:16px;">
          <p style="margin:0;white-space:pre-wrap;line-height:1.6;color:#e5e5e5;">${escapeHtml(message.trim())}</p>
        </div>

        ${
          logAnalysis
            ? `<h3 style="color:#ffffff;margin:24px 0 8px;font-size:14px;">Log Analysis (AI-curated)</h3>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:16px;">
          <pre style="margin:0;white-space:pre-wrap;line-height:1.5;color:#d4d4d4;font-size:12px;font-family:'SF Mono',Menlo,monospace;">${escapeHtml(logAnalysis)}</pre>
        </div>`
            : ""
        }

        ${logs ? '<p style="color:#a3a3a3;font-size:12px;margin:8px 0 0;">Full raw logs also attached.</p>' : ""}
      </div>
    `;

    const attachments = logs
      ? [{ filename: `mitable-logs-${Date.now()}.txt`, content: Buffer.from(logs, "utf-8") }]
      : [];

    const { error } = await resend.emails.send({
      from: config.resend.fromAddress,
      to: FEEDBACK_RECIPIENT,
      subject: `[Feedback] from ${senderName} — ${message.trim().slice(0, 60)}`,
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
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default router;
