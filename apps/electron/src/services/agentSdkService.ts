import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { app } from "electron";
import { existsSync, realpathSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { createLogger } from "../lib/logger";
import { skillsStore, type AgentSkill } from "./skillsStore";
import { authManager } from "./authManager";

const logger = createLogger("AgentSdkService");

/**
 * Locate the Claude Code CLI binary.
 * Checks common locations and falls back to `which claude`.
 */
function findClaudeCodeExecutable(): string | undefined {
  const homeDir = app.getPath("home");

  // Common install locations (in order of preference)
  const candidates = [
    join(homeDir, ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        // Resolve symlinks to get the actual binary
        return realpathSync(candidate);
      }
    } catch {
      // Skip if can't access
    }
  }

  // Fallback: ask the shell
  try {
    const result = execSync("which claude", { encoding: "utf-8", timeout: 3000 }).trim();
    if (result && existsSync(result)) {
      return realpathSync(result);
    }
  } catch {
    // Not found via which
  }

  return undefined;
}

// Phase 1: read-only tools (no mutations)
const READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "mcp__mitable__get_my_sessions",
  "mcp__mitable__get_daily_summary",
  "mcp__mitable__slack_list_channels",
];

// Phase 2: all tools including write/mutate
const ALL_TOOLS = [
  ...READ_ONLY_TOOLS,
  "Write",
  "Edit",
  "Bash",
  "mcp__mitable__slack_send_message",
];

const ACTION_PLAN_MARKER = "[ACTION_PLAN]";

const PLAN_MODE_INSTRUCTIONS = `

## Action Approval Protocol
You operate in a two-phase approval flow:

**For informational requests** (questions about work, summaries, searches):
- Answer directly using read-only tools. Do NOT include the [ACTION_PLAN] marker.

**For action requests** (file writes, shell commands, Slack messages, edits):
- Do NOT execute the action. Instead, present a clear numbered plan of what you will do.
- End your response with the exact text: [ACTION_PLAN]
- Example format:
  Here's what I'll do:
  1. Create file ~/hello.txt with content "Hello World"
  2. Make it executable with chmod +x

  [ACTION_PLAN]

The user will then approve or deny. Only after approval will you receive full tool access to execute.`;

export interface AgentMessageEvent {
  type: "result" | "tool_use" | "error" | "init" | "text_delta" | "assistant_text" | "plan_proposed";
  data: unknown;
}

export type AgentCallbacks = {
  onEvent: (event: AgentMessageEvent) => void;
};

class AgentSdkService {
  private sessions: Map<string, string> = new Map(); // conversationId → sessionId
  private pendingPlans: Map<string, string> = new Map(); // conversationId → plan text
  private abortController: AbortController | null = null;

  async sendMessage(
    conversationId: string,
    message: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    // Phase 1: read-only tools with plan-mode instructions
    await this.runQuery(conversationId, message, callbacks, READ_ONLY_TOOLS, true);
  }

  async approvePlan(
    conversationId: string,
    callbacks: AgentCallbacks
  ): Promise<void> {
    const planText = this.pendingPlans.get(conversationId);
    if (!planText) {
      callbacks.onEvent({ type: "error", data: "No pending plan to approve." });
      return;
    }

    this.pendingPlans.delete(conversationId);

    // Phase 2: resume session with full tools and execute
    await this.runQuery(
      conversationId,
      "User approved the plan. Execute it now.",
      callbacks,
      ALL_TOOLS,
      false
    );
  }

  denyPlan(conversationId: string): void {
    this.pendingPlans.delete(conversationId);
    logger.info("Plan denied", { conversationId });
  }

  private async runQuery(
    conversationId: string,
    message: string,
    callbacks: AgentCallbacks,
    tools: string[],
    isPlanPhase: boolean
  ): Promise<void> {
    const apiUrl = authManager.getApiBaseUrl();
    const accessToken = authManager.getAccessToken();

    if (!accessToken) {
      callbacks.onEvent({
        type: "error",
        data: "Not authenticated. Please log in first.",
      });
      return;
    }

    // Read skills from local filesystem
    const skills = await skillsStore.getRelevant();
    const systemPrompt = this.buildSystemPrompt(skills, isPlanPhase);

    // Create custom MCP server with integration tools
    const mitableTools = this.createMitableToolsServer(apiUrl, accessToken);

    // Find the Claude Code CLI binary
    const claudePath = findClaudeCodeExecutable();
    if (!claudePath) {
      callbacks.onEvent({
        type: "error",
        data: "Claude Code CLI not found. Please install it: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
      });
      return;
    }

    // Track abort controller for cancellation
    this.abortController = new AbortController();

    try {
      const resumeId = this.sessions.get(conversationId);

      logger.info("Starting agent query", {
        conversationId,
        claudePath,
        apiUrl,
        hasResume: !!resumeId,
        isPlanPhase,
        toolCount: tools.length,
      });

      for await (const msg of query({
        prompt: message,
        options: {
          ...(resumeId ? { resume: resumeId } : {}),
          pathToClaudeCodeExecutable: claudePath,
          cwd: app.getPath("home"),
          allowedTools: tools,
          mcpServers: { mitable: mitableTools },
          systemPrompt,
          maxTurns: 25,
          // bypassPermissions skips all interactive prompts — required for headless
          // operation (no stdin). Tool access is already restricted via allowedTools.
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          env: {
            ...process.env,
            // Point Claude Code to our backend proxy (which injects the real API key)
            ANTHROPIC_BASE_URL: `${apiUrl}/api/agent/proxy`,
            // Dummy key — the proxy replaces it server-side
            ANTHROPIC_API_KEY: "sk-ant-proxy-key",
            // Prevent "nested session" error when Electron is launched from Claude Code during dev
            CLAUDECODE: "",
          },
        },
      })) {
        const msgType = (msg as { type?: string }).type;
        const msgSubtype = (msg as { subtype?: string }).subtype;

        // Log details for debugging tool hangs
        if (msgType === "assistant") {
          const blocks = (msg as { message?: { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> } }).message?.content || [];
          const toolBlocks = blocks.filter((b) => b.type === "tool_use");
          const summary = toolBlocks.map((b) => {
            const inputSnippet = b.input?.command
              ? String(b.input.command).slice(0, 100)
              : b.input?.pattern
                ? String(b.input.pattern).slice(0, 60)
                : undefined;
            return `${b.name}${inputSnippet ? `: ${inputSnippet}` : ""}`;
          });
          logger.info("Agent message received", {
            type: msgType,
            tools: summary.length ? summary : undefined,
            hasText: blocks.some((b) => b.type === "text"),
          });
        } else {
          logger.info("Agent message received", { type: msgType, subtype: msgSubtype });
        }

        // Final result (success or error)
        if ("result" in msg && (msg as { type?: string }).type === "result") {
          const resultMsg = msg as { result?: string; is_error?: boolean; errors?: string[] };
          if (resultMsg.is_error) {
            callbacks.onEvent({
              type: "error",
              data: resultMsg.errors?.join("\n") || "Agent encountered an error",
            });
          } else {
            const resultText = resultMsg.result || "";

            // Check for plan marker in the final result
            if (isPlanPhase && resultText.includes(ACTION_PLAN_MARKER)) {
              const cleanPlan = resultText.replace(ACTION_PLAN_MARKER, "").trim();
              this.pendingPlans.set(conversationId, cleanPlan);
              callbacks.onEvent({ type: "plan_proposed", data: cleanPlan });
            } else {
              callbacks.onEvent({ type: "result", data: resultText });
            }
          }
        }
        // Assistant message — contains the actual response content
        else if ((msg as { type?: string }).type === "assistant") {
          const assistantMsg = msg as {
            message?: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> };
          };
          const content = assistantMsg.message?.content || [];

          // Forward tool_use blocks as progress indicators (include input snippet for context)
          for (const block of content) {
            if (block.type === "tool_use" && block.name) {
              // Extract a short snippet from tool input for UI context
              const detail = block.input?.command
                ? String(block.input.command).slice(0, 80)
                : block.input?.file_path
                  ? String(block.input.file_path).split("/").pop()
                  : block.input?.pattern
                    ? String(block.input.pattern).slice(0, 60)
                    : block.input?.query
                      ? String(block.input.query).slice(0, 60)
                      : block.input?.url
                        ? String(block.input.url).slice(0, 60)
                        : undefined;
              callbacks.onEvent({ type: "tool_use", data: { name: block.name, detail } });
            }
          }

          // Forward text blocks as intermediate text (not final result — keeps loading state)
          const textBlocks = content.filter((b) => b.type === "text");
          const text = textBlocks.map((b) => b.text || "").join("");
          if (text) {
            callbacks.onEvent({ type: "assistant_text", data: text });
          }
        }
        // Session init
        else if (
          (msg as { type?: string }).type === "system" &&
          (msg as { subtype?: string }).subtype === "init"
        ) {
          const initMsg = msg as { session_id: string };
          this.sessions.set(conversationId, initMsg.session_id);
          callbacks.onEvent({ type: "init", data: { sessionId: initMsg.session_id } });
        }
        // Tool progress — show what tool is being used
        else if ((msg as { type?: string }).type === "tool_progress") {
          const toolMsg = msg as { tool_name?: string };
          callbacks.onEvent({ type: "tool_use", data: { name: toolMsg.tool_name } });
        }
      }

      logger.info("Agent query completed", { conversationId, isPlanPhase });
    } catch (error) {
      logger.error("Agent query failed", error);
      callbacks.onEvent({
        type: "error",
        data: error instanceof Error ? error.message : "Agent query failed",
      });
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async generateSkillsForSession(sessionId: string): Promise<void> {
    const apiUrl = authManager.getApiBaseUrl();
    const accessToken = authManager.getAccessToken();
    if (!accessToken) return;

    try {
      const response = await fetch(`${apiUrl}/api/agent/generate-skills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        logger.error("Failed to generate skills", { status: response.status });
        return;
      }

      const data = (await response.json()) as {
        skills: Array<{
          name: string;
          description: string;
          category: string;
          contextSummary: string;
          relatedApps: string[];
        }>;
      };

      if (data.skills?.length) {
        await skillsStore.mergeSkills(data.skills, "session", [sessionId]);
        logger.info(`Generated and merged ${data.skills.length} skills for session ${sessionId}`);
      }
    } catch (error) {
      logger.error("Skill generation failed", error);
    }
  }

  private createMitableToolsServer(apiUrl: string, accessToken: string) {
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const getMySessionsTool = tool(
      "get_my_sessions",
      "Get the user's recent work sessions with summaries. Returns session data including what apps were used, key activities, and time spent.",
      { days: z.number().optional().describe("Number of days to look back (default 7)") },
      async ({ days }) => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const res = await fetch(`${apiUrl}/api/agent/tools/sessions?days=${days ?? 7}`, {
            headers,
          });
          const text = await res.text();
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const getDailySummaryTool = tool(
      "get_daily_summary",
      "Get today's work activity summary including all sessions, apps used, and time breakdown.",
      {},
      async () => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const res = await fetch(`${apiUrl}/api/agent/tools/daily-summary`, { headers });
          const text = await res.text();
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const slackChannelsTool = tool(
      "slack_list_channels",
      "List available Slack channels in the user's workspace.",
      {},
      async () => {
        const res = await fetch(`${apiUrl}/api/agent/tools/slack/channels`, {
          headers: authHeaders,
        });
        return { content: [{ type: "text" as const, text: await res.text() }] };
      }
    );

    const slackSendTool = tool(
      "slack_send_message",
      "Send a message to a Slack channel. IMPORTANT: Always confirm with the user before sending.",
      {
        channelId: z.string().describe("Slack channel ID"),
        text: z.string().describe("Message text to send"),
      },
      async ({ channelId, text }) => {
        const res = await fetch(`${apiUrl}/api/agent/tools/slack/send`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ channelId, text }),
        });
        return { content: [{ type: "text" as const, text: await res.text() }] };
      }
    );

    return createSdkMcpServer({
      name: "mitable",
      tools: [getMySessionsTool, getDailySummaryTool, slackChannelsTool, slackSendTool],
    });
  }

  private buildSystemPrompt(skills: AgentSkill[], isPlanPhase: boolean): string {
    const skillsSection =
      skills.length > 0
        ? skills.map((s) => `### ${s.name}\n${s.contextSummary}`).join("\n\n")
        : "No skills available yet. The user hasn't captured enough work sessions for skill generation.";

    const basePrompt = `You are Mitable Agent — a personal AI assistant that helps users take action based on their captured work context.

## Your Capabilities
1. **File operations**: Read, write, and edit files on the user's machine
2. **Terminal**: Run shell commands via Bash
3. **Web**: Search the web and fetch pages
4. **Work context**: Access the user's captured work sessions, activity data, and daily summaries via Mitable tools
5. **Integrations**: Send Slack messages (more integrations coming)

## User's Work Context (Auto-Generated Skills)
${skillsSection}

## Rules
- Use Mitable tools (get_my_sessions, get_daily_summary) to gather context before acting when the user asks about their work
- For integration actions (Slack, Linear, Gmail), ALWAYS confirm the message content and target with the user before sending
- Match the user's communication style from their skills when drafting messages
- Be concise — users want quick actions, not essays
- When asked about work patterns or time spent, use the session data tools to give data-driven answers`;

    return isPlanPhase ? basePrompt + PLAN_MODE_INSTRUCTIONS : basePrompt;
  }
}

export const agentSdkService = new AgentSdkService();
