import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { dirname, join } from "path";
import electronLogMain from "electron-log/main";
import { createLogger } from "../../lib/logger";

const feedbackLogger = createLogger("FeedbackAnalysis");

const FEEDBACK_MAIN_LOG_TAIL_LINES = 10_000;
const FEEDBACK_RENDERER_LOG_TAIL_LINES = 10_000;
const MAIN_LOG_READ_MAX_BYTES = 4 * 1024 * 1024;
const RENDERER_LOG_MAX_BYTES = 12 * 1024 * 1024;
const RENDERER_LOG_READ_MAX_BYTES = 6 * 1024 * 1024;

function getRendererLogPath(): string | null {
  const mainPath = electronLogMain.transports.file.getFile()?.path;
  if (!mainPath) return null;
  return join(dirname(mainPath), "renderer.log");
}

export function registerFeedbackHandlers() {
  ipcMain.on(IPC_CHANNELS.FEEDBACK_APPEND_RENDERER_LOG, (_event, chunk: unknown) => {
    if (typeof chunk !== "string" || chunk.length === 0) return;
    if (chunk.length > 1_500_000) return;
    void (async () => {
      try {
        const fsp = await import("fs/promises");
        const rPath = getRendererLogPath();
        if (!rPath) return;
        await fsp.appendFile(rPath, chunk, "utf8");
        const st = await fsp.stat(rPath);
        if (st.size > RENDERER_LOG_MAX_BYTES) {
          const bak = `${rPath}.1`;
          try {
            await fsp.unlink(bak);
          } catch {
            /* no prior backup */
          }
          await fsp.rename(rPath, bak);
          await fsp.writeFile(
            rPath,
            `${new Date().toISOString()} [console.log] [renderer] Older lines rotated to renderer.log.1 (size cap)\n`,
            "utf8"
          );
        }
      } catch {
        /* avoid breaking renderer */
      }
    })();
  });

  ipcMain.handle(IPC_CHANNELS.FEEDBACK_GET_LOGS, async () => {
    try {
      const mainPath = electronLogMain.transports.file.getFile()?.path;
      if (!mainPath) {
        return { success: false, logs: "", rendererLogs: "", error: "Log file path not found" };
      }

      const fsp = await import("fs/promises");

      let mainContent = "";
      const stMain = await fsp.stat(mainPath).catch(() => null);
      if (stMain && stMain.size > 0) {
        if (stMain.size <= MAIN_LOG_READ_MAX_BYTES) {
          mainContent = await fsp.readFile(mainPath, "utf-8");
        } else {
          const fh = await fsp.open(mainPath, "r");
          try {
            const start = Number(stMain.size) - MAIN_LOG_READ_MAX_BYTES;
            const buf = Buffer.alloc(MAIN_LOG_READ_MAX_BYTES);
            await fh.read(buf, 0, MAIN_LOG_READ_MAX_BYTES, start);
            let s = buf.toString("utf8");
            const nl = s.indexOf("\n");
            if (nl !== -1) s = s.slice(nl + 1);
            mainContent =
              `...[main.log: last ~${Math.round(MAIN_LOG_READ_MAX_BYTES / 1024)}KB of file]\n\n` +
              s;
          } finally {
            await fh.close();
          }
        }
      }
      const mainLines = mainContent.split("\n");
      const mainTail = mainLines.slice(-FEEDBACK_MAIN_LOG_TAIL_LINES).join("\n");

      let rendererLogs = "";
      const rPath = getRendererLogPath();
      if (rPath) {
        try {
          const st = await fsp.stat(rPath).catch(() => null);
          if (st && st.size > 0) {
            if (st.size <= RENDERER_LOG_READ_MAX_BYTES) {
              rendererLogs = await fsp.readFile(rPath, "utf-8");
            } else {
              const fh = await fsp.open(rPath, "r");
              try {
                const start = Number(st.size) - RENDERER_LOG_READ_MAX_BYTES;
                const buf = Buffer.alloc(RENDERER_LOG_READ_MAX_BYTES);
                await fh.read(buf, 0, RENDERER_LOG_READ_MAX_BYTES, start);
                let s = buf.toString("utf8");
                const nl = s.indexOf("\n");
                if (nl !== -1) s = s.slice(nl + 1);
                rendererLogs =
                  `...[renderer.log: last ~${Math.round(RENDERER_LOG_READ_MAX_BYTES / 1024)}KB of file]\n\n` +
                  s;
              } finally {
                await fh.close();
              }
            }
          }
        } catch {
          rendererLogs = "";
        }
        if (rendererLogs) {
          const rl = rendererLogs.split("\n");
          rendererLogs = rl.slice(-FEEDBACK_RENDERER_LOG_TAIL_LINES).join("\n");
        }
      }

      return { success: true, logs: mainTail, rendererLogs };
    } catch (err) {
      return { success: false, logs: "", rendererLogs: "", error: String(err) };
    }
  });

  // ── Local log analysis via Ollama ───────────────────────────────────────
  ipcMain.handle(
    "feedback:analyze-logs",
    async (
      _event,
      args: { message: string; mainLogs: string; rendererLogs: string }
    ): Promise<{
      success: boolean;
      analysis: string;
      diagnostics: string;
      error?: string;
    }> => {
      const { message, mainLogs, rendererLogs } = args;
      const diag: string[] = [];

      if (!message?.trim()) {
        return { success: false, analysis: "", diagnostics: "", error: "No feedback message" };
      }

      const hasLogs = (mainLogs?.trim().length ?? 0) > 0 || (rendererLogs?.trim().length ?? 0) > 0;
      if (!hasLogs) {
        return { success: true, analysis: "", diagnostics: "No logs to analyze" };
      }

      try {
        const { ollamaService } = await import("../../services/on-device/ollamaService");
        const { getCapabilities } = await import("../../services/on-device/ollamaLifecycle");

        const wasReady = ollamaService.isReady();
        diag.push(`ollama_was_ready: ${wasReady}`);

        let modelToUse: string | null = null;

        if (wasReady) {
          modelToUse = ollamaService.getLoadedModel();
          diag.push(`loaded_model: ${modelToUse}`);
        } else {
          feedbackLogger.info("Ollama not ready — starting for feedback analysis...");
          diag.push("action: launching ollama for feedback analysis");
          try {
            const { initialize } = await import("../../services/on-device/ollamaLifecycle");
            await initialize();
            diag.push("ollama_launch: success");
          } catch (launchErr) {
            diag.push(`ollama_launch: FAILED — ${String(launchErr)}`);
            return {
              success: false,
              analysis: "",
              diagnostics: diag.join("\n"),
              error: `Ollama launch failed: ${String(launchErr)}`,
            };
          }
          const caps = getCapabilities();
          modelToUse = caps?.model ?? null;
          diag.push(`model_after_init: ${modelToUse ?? "none"}`);
          diag.push(`tier: ${caps?.tier ?? "unknown"}`);
        }

        if (!modelToUse) {
          diag.push("result: no model available after init");
          return {
            success: false,
            analysis: "",
            diagnostics: diag.join("\n"),
            error: "No model available",
          };
        }

        const MAX_LOG_LINES = 500;
        const trimLog = (log: string) => {
          if (!log?.trim()) return "";
          const lines = log.split("\n");
          if (lines.length <= MAX_LOG_LINES) return log;
          return (
            `...[showing last ${MAX_LOG_LINES} of ${lines.length} lines]\n` +
            lines.slice(-MAX_LOG_LINES).join("\n")
          );
        };

        const mainTrimmed = trimLog(mainLogs);
        const rendererTrimmed = trimLog(rendererLogs);

        let logBundle = "";
        if (mainTrimmed) logBundle += `=== Main Process Logs ===\n${mainTrimmed}\n\n`;
        if (rendererTrimmed) logBundle += `=== Renderer Logs ===\n${rendererTrimmed}\n\n`;

        diag.push(`log_bundle_chars: ${logBundle.length}`);
        feedbackLogger.info(`Analyzing feedback logs (${logBundle.length} chars)...`);

        let analysis: string;
        try {
          analysis = await ollamaService.chatCompletion(
            [
              {
                role: "system",
                content:
                  "You are a log analysis assistant for Mitable, an Electron desktop app. " +
                  "A user submitted feedback about an issue. You have their main process and renderer logs. " +
                  "Find errors, warnings, stack traces, and failed HTTP requests related to their feedback. " +
                  "Write a short report (under 50 lines) with timestamps and relevant log snippets. " +
                  "If nothing relevant is found, say so in one line. Plain text only.",
              },
              {
                role: "user",
                content: `User feedback: "${message.trim()}"\n\n${logBundle}\n\nAnalyze the logs above and report findings related to the user's feedback.`,
              },
            ],
            { temperature: 0.1, max_tokens: 1000 }
          );
          diag.push("analysis: success");
        } catch (inferErr) {
          diag.push(`analysis: FAILED — ${String(inferErr)}`);
          return {
            success: false,
            analysis: "",
            diagnostics: diag.join("\n"),
            error: `Inference failed: ${String(inferErr)}`,
          };
        }

        feedbackLogger.info("Feedback log analysis complete");

        if (!wasReady) {
          feedbackLogger.info("Unloading model (was not loaded before feedback analysis)");
          await ollamaService.forceUnloadModel();
          diag.push("model_unloaded: true");
        }

        return { success: true, analysis: analysis.trim(), diagnostics: diag.join("\n") };
      } catch (err) {
        diag.push(`unexpected_error: ${String(err)}`);
        feedbackLogger.error("Feedback log analysis failed:", String(err));
        return {
          success: false,
          analysis: "",
          diagnostics: diag.join("\n"),
          error: String(err),
        };
      }
    }
  );

  // ── Submit feedback: persist locally + fire-and-forget email ────────────
  ipcMain.handle(
    "feedback:submit",
    async (
      _event,
      args: {
        message: string;
        logAnalysis: string;
        ollamaDiagnostics: string;
        mainLogs: string;
        rendererLogs: string;
        userName: string;
        userEmail: string;
        token: string | null;
        apiBaseUrl: string;
        isAnonymous: boolean;
      }
    ): Promise<{ success: boolean; error?: string }> => {
      const {
        message,
        logAnalysis,
        ollamaDiagnostics,
        mainLogs,
        rendererLogs,
        userName,
        userEmail,
      } = args;

      const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // 1. Persist to local PGlite (always succeeds if DB is up)
      try {
        const { pgDb } = await import("../../services/on-device/pgDb");
        await pgDb.insertFeedback({
          id: feedbackId,
          message: message.trim(),
          logAnalysis,
          userName,
          userEmail,
          emailSent: false,
        });
        feedbackLogger.info(`Feedback saved locally: ${feedbackId}`);
      } catch (err) {
        feedbackLogger.error("Failed to persist feedback locally:", String(err));
      }

      // 2. Fire-and-forget: send email directly via Resend API (on-device)
      (async () => {
        try {
          const { keyVault } = await import("../../services/on-device/keyVault");
          const resendKey = await keyVault.loadResendKey();
          if (!resendKey) {
            feedbackLogger.warn(`No Resend API key — skipping email for ${feedbackId}`);
            return;
          }

          const subject = `Mitable Feedback — ${userName} (${userEmail})`;

          let htmlBody = `<h2>Feedback from ${userName}</h2>`;
          htmlBody += `<p><strong>Email:</strong> ${userEmail}</p>`;
          htmlBody += `<p><strong>Message:</strong></p><pre>${message.trim()}</pre>`;
          if (logAnalysis) {
            htmlBody += `<h3>Log Analysis</h3><pre>${logAnalysis}</pre>`;
          }
          if (ollamaDiagnostics) {
            htmlBody += `<h3>Diagnostics</h3><pre>${ollamaDiagnostics}</pre>`;
          }
          if (mainLogs) {
            const truncated = mainLogs.length > 50_000 ? mainLogs.slice(-50_000) : mainLogs;
            htmlBody += `<h3>Main Process Logs (tail)</h3><pre>${truncated}</pre>`;
          }
          if (rendererLogs) {
            const truncated =
              rendererLogs.length > 50_000 ? rendererLogs.slice(-50_000) : rendererLogs;
            htmlBody += `<h3>Renderer Logs (tail)</h3><pre>${truncated}</pre>`;
          }

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: "Mitable Feedback <feedback@mitable.ai>",
              to: ["aurel@mitable.ai"],
              subject,
              html: htmlBody,
            }),
            signal: AbortSignal.timeout(15_000),
          });

          if (res.ok) {
            feedbackLogger.info(`Feedback email sent via Resend for ${feedbackId}`);
            try {
              const { pgDb } = await import("../../services/on-device/pgDb");
              await pgDb.markFeedbackEmailSent(feedbackId);
            } catch {
              /* best-effort DB update */
            }
          } else {
            const body = await res.text().catch(() => "");
            feedbackLogger.warn(`Resend API error (${res.status}) for ${feedbackId}: ${body}`);
          }
        } catch (err) {
          feedbackLogger.warn(`Resend email failed for ${feedbackId}:`, String(err));
        }
      })();

      return { success: true };
    }
  );
}
