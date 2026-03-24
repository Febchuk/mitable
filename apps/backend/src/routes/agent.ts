import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { skillGenerationService } from "../services/skill-generation.service.js";
import { slackService } from "../services/slack.service.js";
import { createLogger } from "../lib/logger.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";
import { AskEnvironment } from "../services/rlm/ask-environment.js";
import { AgentQueryEnvironment } from "../services/rlm/agent-query-environment.js";
import { getAgentQueryToolByName } from "../services/rlm/agent-query-tools.js";
import { getAgentQuerySystemPrompt } from "../services/rlm/agent-query-prompts.js";
import { UserActivityQueryService } from "../services/user-activity-queries.js";
import { parseJsonResponse } from "../lib/parse-json.js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

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

// Unified activity scan: queries activity_blocks, daily_activities, sessions, and documents
// for a date range (max 31 days). Returns a compact overview across ALL content types.
agentRouter.get("/tools/activity", async (req: Request, res: Response) => {
  try {
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const service = new UserActivityQueryService(req.userId!);
    const result = await service.getActivity(startDate, endDate);
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to fetch activity");
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

// Drill into a specific activity item by ID and type
agentRouter.get("/tools/activity-detail", async (req: Request, res: Response) => {
  try {
    const { id, type } = req.query as { id?: string; type?: string };
    if (!id || !type) {
      res.status(400).json({ error: "id and type required (type: block | session | document)" });
      return;
    }
    if (type !== "block" && type !== "session" && type !== "document") {
      res.status(400).json({ error: "Invalid type. Must be: block, session, or document" });
      return;
    }

    const service = new UserActivityQueryService(req.userId!);
    const result = await service.getActivityDetail(id, type);
    if (!result) {
      const labels = { block: "Activity block", session: "Session", document: "Document" };
      res.status(404).json({ error: `${labels[type]} not found` });
      return;
    }
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to fetch activity detail");
    res.status(500).json({ error: "Failed to fetch activity detail" });
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

// ── Admin Analytics Tool Endpoints ───────────────────────────────────
// These endpoints are admin-only and reuse the AskEnvironment for bounded data.
// The Electron-side agent conditionally registers these tools based on user role.

async function requireAdminRole(req: Request, res: Response): Promise<boolean> {
  const [user] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, req.userId!))
    .limit(1);

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// List all team members in the org
agentRouter.get("/tools/admin/team-members", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdminRole(req, res))) return;
    const env = new AskEnvironment(req.organizationId!);
    const result = await env.listTeamMembers();
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to list team members");
    res.status(500).json({ error: "Failed to list team members" });
  }
});

// Get org-level productivity metrics for a date range (max 31 days)
agentRouter.get("/tools/admin/org-metrics", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdminRole(req, res))) return;
    const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };
    if (!start_date || !end_date) {
      res.status(400).json({ error: "start_date and end_date required (YYYY-MM-DD)" });
      return;
    }
    const env = new AskEnvironment(req.organizationId!);
    const result = await env.queryOrgMetrics(start_date, end_date);
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to query org metrics");
    res.status(500).json({ error: "Failed to query org metrics" });
  }
});

// Get detailed metrics for a specific team member (max 31 days)
agentRouter.get("/tools/admin/user-metrics", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdminRole(req, res))) return;
    const { user_name, start_date, end_date } = req.query as {
      user_name?: string;
      start_date?: string;
      end_date?: string;
    };
    if (!user_name || !start_date || !end_date) {
      res.status(400).json({ error: "user_name, start_date, and end_date required" });
      return;
    }
    const env = new AskEnvironment(req.organizationId!);
    const result = await env.queryUserMetrics(user_name, start_date, end_date);
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to query user metrics");
    res.status(500).json({ error: "Failed to query user metrics" });
  }
});

// Get session summaries for a specific team member (max 31 days, 20 sessions)
agentRouter.get("/tools/admin/session-summaries", async (req: Request, res: Response) => {
  try {
    if (!(await requireAdminRole(req, res))) return;
    const { user_name, start_date, end_date } = req.query as {
      user_name?: string;
      start_date?: string;
      end_date?: string;
    };
    if (!user_name || !start_date || !end_date) {
      res.status(400).json({ error: "user_name, start_date, and end_date required" });
      return;
    }
    const env = new AskEnvironment(req.organizationId!);
    const result = await env.querySessionSummaries(user_name, start_date, end_date);
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to query session summaries");
    res.status(500).json({ error: "Failed to query session summaries" });
  }
});

// ── Agent Chat Persistence ───────────────────────────────────────────

// List conversations for current user (newest first)
agentRouter.get("/chats", async (req: Request, res: Response) => {
  try {
    const conversations = await db
      .select({
        id: schema.agentConversations.id,
        title: schema.agentConversations.title,
        sessionId: schema.agentConversations.sessionId,
        createdAt: schema.agentConversations.createdAt,
        updatedAt: schema.agentConversations.updatedAt,
      })
      .from(schema.agentConversations)
      .where(eq(schema.agentConversations.userId, req.userId!))
      .orderBy(desc(schema.agentConversations.updatedAt));

    res.json({ conversations });
  } catch (error) {
    logger.error({ error }, "Failed to list agent chats");
    res.status(500).json({ error: "Failed to list agent chats" });
  }
});

// Create a new conversation
agentRouter.post("/chats", async (req: Request, res: Response) => {
  try {
    const { id, title } = req.body as { id?: string; title?: string };

    const [conversation] = await db
      .insert(schema.agentConversations)
      .values({
        ...(id ? { id } : {}),
        userId: req.userId!,
        organizationId: req.organizationId!,
        title: title || "New chat",
      })
      .returning();

    res.json({ conversation });
  } catch (error) {
    logger.error({ error }, "Failed to create agent chat");
    res.status(500).json({ error: "Failed to create agent chat" });
  }
});

// Get a conversation with its messages
agentRouter.get("/chats/:id", async (req: Request, res: Response) => {
  try {
    const [conversation] = await db
      .select()
      .from(schema.agentConversations)
      .where(
        and(
          eq(schema.agentConversations.id, req.params.id),
          eq(schema.agentConversations.userId, req.userId!)
        )
      );

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const messages = await db
      .select()
      .from(schema.agentMessages)
      .where(eq(schema.agentMessages.conversationId, req.params.id))
      .orderBy(schema.agentMessages.createdAt);

    res.json({ conversation, messages });
  } catch (error) {
    logger.error({ error }, "Failed to get agent chat");
    res.status(500).json({ error: "Failed to get agent chat" });
  }
});

// Rename a conversation
agentRouter.patch("/chats/:id", async (req: Request, res: Response) => {
  try {
    const { title, sessionId } = req.body as { title?: string; sessionId?: string };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (sessionId !== undefined) updates.sessionId = sessionId;

    const [updated] = await db
      .update(schema.agentConversations)
      .set(updates)
      .where(
        and(
          eq(schema.agentConversations.id, req.params.id),
          eq(schema.agentConversations.userId, req.userId!)
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ conversation: updated });
  } catch (error) {
    logger.error({ error }, "Failed to update agent chat");
    res.status(500).json({ error: "Failed to update agent chat" });
  }
});

// Delete a conversation (cascades to messages)
agentRouter.delete("/chats/:id", async (req: Request, res: Response) => {
  try {
    const [deleted] = await db
      .delete(schema.agentConversations)
      .where(
        and(
          eq(schema.agentConversations.id, req.params.id),
          eq(schema.agentConversations.userId, req.userId!)
        )
      )
      .returning({ id: schema.agentConversations.id });

    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Failed to delete agent chat");
    res.status(500).json({ error: "Failed to delete agent chat" });
  }
});

// Add a message to a conversation
agentRouter.post("/chats/:id/messages", async (req: Request, res: Response) => {
  try {
    const { role, content, toolCalls } = req.body as {
      role: string;
      content: string;
      toolCalls?: Array<{ name: string; input?: unknown; detail?: string }>;
    };

    if (!role || !content) {
      res.status(400).json({ error: "role and content required" });
      return;
    }

    // Ownership check: verify the conversation belongs to this user
    const [conversation] = await db
      .select({ id: schema.agentConversations.id })
      .from(schema.agentConversations)
      .where(
        and(
          eq(schema.agentConversations.id, req.params.id),
          eq(schema.agentConversations.userId, req.userId!)
        )
      )
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [message] = await db
      .insert(schema.agentMessages)
      .values({
        conversationId: req.params.id,
        role,
        content,
        toolCalls: toolCalls || [],
      })
      .returning();

    // Update conversation timestamp + auto-title from first user message
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (role === "user") {
      const [convo] = await db
        .select({ title: schema.agentConversations.title })
        .from(schema.agentConversations)
        .where(
          and(
            eq(schema.agentConversations.id, req.params.id),
            eq(schema.agentConversations.userId, req.userId!)
          )
        );

      if (convo?.title === "New chat") {
        updates.title = content.length > 60 ? content.slice(0, 57) + "..." : content;
      }
    }

    await db
      .update(schema.agentConversations)
      .set(updates)
      .where(
        and(
          eq(schema.agentConversations.id, req.params.id),
          eq(schema.agentConversations.userId, req.userId!)
        )
      );

    res.json({ message });
  } catch (error) {
    logger.error({ error }, "Failed to add agent message");
    res.status(500).json({ error: "Failed to add agent message" });
  }
});

// ── Agent Query Layer (Layer 1) ─────────────────────────────────────
// Lightweight RLM loop for conversational queries about the user's work.
// No CLI subprocess — direct LLM + DB queries, fast and cheap.

const AGENT_QUERY_MAX_ITERATIONS = 10;

// ── LLM clients (lazy init) — Claude → GPT-5 → DeepSeek V3.2 ──────

let agentAnthropicClient: Anthropic | null = null;
let agentOpenaiClient: OpenAI | null = null;
let agentDeepseekClient: OpenAI | null = null;

function getAgentAnthropicClient(): Anthropic | null {
  if (!agentAnthropicClient && config.anthropic.apiKey) {
    agentAnthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return agentAnthropicClient;
}

function getAgentOpenaiClient(): OpenAI | null {
  if (!agentOpenaiClient && config.openai.apiKey) {
    agentOpenaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return agentOpenaiClient;
}

function getAgentDeepseekClient(): OpenAI | null {
  if (!agentDeepseekClient && config.deepseek.apiKey) {
    agentDeepseekClient = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: "https://api.deepseek.com",
    });
  }
  return agentDeepseekClient;
}

async function callAgentQueryLLM(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  // 1. Claude Sonnet 4.5 (primary)
  const claude = getAgentAnthropicClient();
  if (claude) {
    try {
      const response = await claude.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        system: systemPrompt,
        messages,
      });
      for (const block of response.content) {
        if (block.type === "text") return block.text.trim();
      }
    } catch (error) {
      const errStr = String(error);
      const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
      if (isFatal) {
        logger.error({ error: errStr }, "Agent query: Claude auth/billing error");
        agentAnthropicClient = null;
      } else {
        logger.warn({ error: errStr }, "Agent query: Claude failed (transient) — trying GPT-5");
      }
    }
  }

  // 2. GPT-5 (fallback)
  const oai = getAgentOpenaiClient();
  if (oai) {
    try {
      const completion = await oai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_completion_tokens: 4000,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return content;
    } catch (error) {
      logger.warn({ error: String(error) }, "Agent query: GPT-5 failed — trying DeepSeek");
    }
  }

  // 3. DeepSeek V3.2 (last resort)
  const deepseek = getAgentDeepseekClient();
  if (deepseek) {
    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 4000,
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  }

  throw new Error("No LLM available — need ANTHROPIC_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY");
}

agentRouter.post("/ask", async (req: Request, res: Response) => {
  try {
    const { message, conversationId } = req.body as {
      message: string;
      conversationId?: string;
    };

    if (!message) {
      res.status(400).json({ error: "message required" });
      return;
    }

    // Load conversation history server-side if a conversationId is provided
    let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (conversationId) {
      // Verify ownership
      const [convo] = await db
        .select({ id: schema.agentConversations.id })
        .from(schema.agentConversations)
        .where(
          and(
            eq(schema.agentConversations.id, conversationId),
            eq(schema.agentConversations.userId, req.userId!)
          )
        )
        .limit(1);

      if (convo) {
        const dbMessages = await db
          .select({ role: schema.agentMessages.role, content: schema.agentMessages.content })
          .from(schema.agentMessages)
          .where(eq(schema.agentMessages.conversationId, conversationId))
          .orderBy(schema.agentMessages.createdAt);

        conversationHistory = dbMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      }
    }

    // Resolve user name for the prompt
    const [user] = await db
      .select({ firstName: schema.users.firstName })
      .from(schema.users)
      .where(eq(schema.users.id, req.userId!))
      .limit(1);

    const userName = user?.firstName || "there";
    const environment = new AgentQueryEnvironment(req.userId!, req.organizationId!);
    const systemPrompt = getAgentQuerySystemPrompt(userName);

    const rlmMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...conversationHistory,
      { role: "user", content: message },
    ];

    let iterations = 0;
    let toolCalls = 0;
    let finalResponse = "";
    let escalate = false;

    while (iterations < AGENT_QUERY_MAX_ITERATIONS) {
      iterations++;

      const llmRaw = await callAgentQueryLLM(systemPrompt, rlmMessages);

      let decision: {
        tool?: string;
        parameters?: Record<string, string>;
        reasoning?: string;
        done?: boolean;
        response?: string;
        escalate?: boolean;
        reason?: string;
      };

      try {
        decision = parseJsonResponse(llmRaw);
      } catch {
        finalResponse = llmRaw;
        break;
      }

      rlmMessages.push({ role: "assistant", content: JSON.stringify(decision) });

      // Check for escalation signal
      if (decision.escalate) {
        escalate = true;
        break;
      }

      if (decision.done && decision.response) {
        finalResponse = decision.response;
        break;
      }

      if (decision.tool && decision.parameters !== undefined) {
        const tool = getAgentQueryToolByName(decision.tool);
        if (!tool) {
          rlmMessages.push({
            role: "user",
            content: `Error: Unknown tool "${decision.tool}". Available: get_my_activity, get_activity_detail.`,
          });
          continue;
        }

        const toolResult = await tool.execute(decision.parameters, environment);
        toolCalls++;

        rlmMessages.push({
          role: "user",
          content: `Tool "${decision.tool}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step.`,
        });
      } else {
        if (decision.response) finalResponse = decision.response;
        break;
      }
    }

    if (escalate) {
      // Collect any data Layer 1 gathered via tool calls to enrich Layer 2's context
      const gatheredContext = rlmMessages
        .filter(
          (m) =>
            m.role === "user" && m.content.startsWith('Tool "') && m.content.includes("returned:")
        )
        .map((m) => m.content)
        .join("\n\n");

      logger.info(
        { iterations, toolCalls, hasContext: gatheredContext.length > 0 },
        "Agent query RLM escalating to SDK"
      );
      res.json({
        escalate: true,
        context: gatheredContext || undefined,
      });
      return;
    }

    if (!finalResponse) {
      finalResponse = "I wasn't able to generate a response. Please try rephrasing your question.";
    }

    logger.info({ iterations, toolCalls }, "Agent query RLM completed");

    res.json({ response: finalResponse });
  } catch (error) {
    logger.error({ error }, "Agent query failed");
    res.status(500).json({ error: "Failed to process query" });
  }
});

export default agentRouter;
