import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { skillGenerationService } from "../services/skill-generation.service.js";
import { slackService } from "../services/slack.service.js";
import { createLogger } from "../lib/logger.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, desc, gte } from "drizzle-orm";

const logger = createLogger({ module: "AgentRoutes" });
const agentRouter = Router();

// ── Anthropic API Proxy ──────────────────────────────────────────────
// Registered BEFORE requireAuth — the Claude CLI subprocess sends
// x-api-key (not a JWT Bearer token), so it can't pass requireAuth.
// We validate via the proxy secret instead.
async function proxyToAnthropic(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = config.anthropic.apiKey;
    if (!apiKey) {
      logger.error("Anthropic API key not configured on backend");
      res.status(500).json({ error: "Anthropic API key not configured" });
      return;
    }

    // Extract the path after /proxy/ → forward to api.anthropic.com
    // req.path is relative to this router's mount, e.g. "/proxy/v1/messages"
    const upstreamPath = req.path.replace(/^\/proxy\//, "");
    const upstreamUrl = `https://api.anthropic.com/${upstreamPath}`;

    logger.info({ method: req.method, upstreamUrl }, "Proxying to Anthropic");

    // Build headers — inject API key, forward relevant headers
    const headers: Record<string, string> = {
      "x-api-key": apiKey,
      "anthropic-version": (req.headers["anthropic-version"] as string) || "2023-06-01",
    };
    if (req.headers["content-type"]) {
      headers["content-type"] = req.headers["content-type"] as string;
    }
    if (req.headers["anthropic-beta"]) {
      headers["anthropic-beta"] = req.headers["anthropic-beta"] as string;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    // Only include body for methods that support it
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const anthropicRes = await fetch(upstreamUrl, fetchOptions);

    // Mirror the upstream status code
    res.status(anthropicRes.status);

    // Forward response headers, skipping encoding headers that Node handles itself
    for (const [key, value] of anthropicRes.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower !== "transfer-encoding" && lower !== "content-encoding") {
        res.setHeader(key, value);
      }
    }

    // Stream the body back chunk-by-chunk for SSE / streaming responses
    if (anthropicRes.body) {
      // Flush headers immediately so SSE events are not buffered
      res.flushHeaders();
      const reader = anthropicRes.body.getReader();
      try {
        let chunk = await reader.read();
        while (!chunk.done) {
          res.write(chunk.value);
          chunk = await reader.read();
        }
      } finally {
        reader.releaseLock();
      }
    }

    res.end();
    logger.info(
      { method: req.method, upstreamUrl, status: anthropicRes.status },
      "Proxy request completed"
    );
  } catch (error) {
    logger.error({ error }, "Anthropic proxy error");
    res.status(500).json({ error: "Failed to proxy request to Anthropic" });
  }
}

// Proxy route — BEFORE requireAuth (CLI uses x-api-key, not JWT)
// Validated by checking for our known proxy key
agentRouter.all(
  "/proxy/*",
  (req: Request, res: Response, next) => {
    const clientKey = req.headers["x-api-key"] as string | undefined;
    if (clientKey !== "sk-ant-proxy-key") {
      res.status(401).json({ error: "Invalid proxy key" });
      return;
    }
    next();
  },
  proxyToAnthropic
);

// All remaining agent routes require JWT auth
agentRouter.use(requireAuth);

// ── Skill Generation ─────────────────────────────────────────────────
// Extracts reusable work-pattern skills from a completed session using Gemini.
agentRouter.post("/generate-skills", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const skills = await skillGenerationService.generateFromSession(sessionId, req.userId!);
    res.json({ skills });
  } catch (error) {
    logger.error({ error }, "Skill generation error");
    res.status(500).json({ error: "Failed to generate skills" });
  }
});

// ── Integration Tool Endpoints ───────────────────────────────────────
// These endpoints are called by the Electron-side Agent SDK as custom MCP tools.

// Session data: recent sessions (default: last 7 days, max 20)
agentRouter.get("/tools/sessions", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sessions = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        sessionType: schema.monitoringSessions.sessionType,
        status: schema.monitoringSessions.status,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        finalSummary: schema.monitoringSessions.finalSummary,
        keyActivities: schema.monitoringSessions.keyActivities,
      })
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, req.userId!),
          gte(schema.monitoringSessions.startedAt, since)
        )
      )
      .orderBy(desc(schema.monitoringSessions.startedAt))
      .limit(20);

    res.json({ sessions });
  } catch (error) {
    logger.error({ error }, "Failed to fetch sessions");
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Session data: all sessions that started today (midnight-relative, UTC)
agentRouter.get("/tools/daily-summary", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessions = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        sessionType: schema.monitoringSessions.sessionType,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        finalSummary: schema.monitoringSessions.finalSummary,
        keyActivities: schema.monitoringSessions.keyActivities,
        timeBreakdown: schema.monitoringSessions.timeBreakdown,
      })
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, req.userId!),
          gte(schema.monitoringSessions.startedAt, today)
        )
      )
      .orderBy(desc(schema.monitoringSessions.startedAt));

    res.json({ date: today.toISOString().split("T")[0], sessions });
  } catch (error) {
    logger.error({ error }, "Failed to fetch daily summary");
    res.status(500).json({ error: "Failed to fetch daily summary" });
  }
});

// Slack: list channels the bot is a member of for the org
agentRouter.get("/tools/slack/channels", async (req: Request, res: Response) => {
  try {
    const channels = await slackService.listChannels(req.organizationId!);
    res.json({ channels });
  } catch (error) {
    logger.error({ error }, "Failed to list Slack channels");
    res.status(500).json({ error: "Failed to list Slack channels" });
  }
});

// Slack: send a message to a channel
agentRouter.post("/tools/slack/send", async (req: Request, res: Response) => {
  try {
    const { channelId, text } = req.body as { channelId?: string; text?: string };
    if (!channelId || !text) {
      res.status(400).json({ error: "channelId and text required" });
      return;
    }

    // slackService.sendMessage expects a message object, not a plain string
    const result = await slackService.sendMessage(req.organizationId!, channelId, { text });
    res.json({ success: result.ok, ts: result.ts, error: result.error });
  } catch (error) {
    logger.error({ error }, "Failed to send Slack message");
    res.status(500).json({ error: "Failed to send Slack message" });
  }
});

export default agentRouter;
