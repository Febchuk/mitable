import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { app } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import { createRequire } from "module";
import { createLogger } from "../lib/logger";
import { skillsStore, type AgentSkill } from "./skillsStore";
import { authManager } from "./authManager";
import { browserBridgeService } from "./browserBridgeService";
import {
  generateDocxLocally,
  generatePdfLocally,
  generateSpreadsheetLocally,
  generateCalendarEventLocally,
  getTempDocument,
} from "./localDocumentService";

const logger = createLogger("AgentSdkService");

/**
 * Resolve the Claude Code CLI bundled inside @anthropic-ai/claude-agent-sdk.
 * The SDK ships its own cli.js — no need to find a system-installed binary.
 * For packaged Electron builds, handles asar-unpacked paths.
 */
function findClaudeCodeExecutable(): string | undefined {
  try {
    const requireModule = createRequire(import.meta.url);
    const sdkEntry = requireModule.resolve("@anthropic-ai/claude-agent-sdk");
    const sdkDir = join(sdkEntry, "..");
    let cliPath = join(sdkDir, "cli.js");

    // In packaged Electron, files inside asar can't be spawned directly
    if (cliPath.includes("app.asar")) {
      const unpackedPath = cliPath.replace("app.asar", "app.asar.unpacked");
      if (existsSync(unpackedPath)) {
        cliPath = unpackedPath;
      }
    }

    if (existsSync(cliPath)) {
      return cliPath;
    }
  } catch (err) {
    logger.warn("Failed to resolve SDK bundled CLI", { error: String(err) });
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
  "mcp__mitable__get_my_activity",
  "mcp__mitable__get_activity_detail",
  "mcp__mitable__slack_list_channels",
  "mcp__mitable__browser_status",
  "mcp__mitable__browser_extract",
  "mcp__mitable__browser_get_tabs",
  "mcp__mitable__browser_wait",
  "mcp__mitable__browser_screenshot",
  "mcp__mitable__browser_scroll",
  "mcp__mitable__browser_hover",
  "mcp__mitable__browser_read_element",
  // Google Workspace skills (read-only: auth check, list folders)
  "mcp__mitable__google_auth_status",
  "mcp__mitable__list_drive_folders",
  // Admin analytics tools (only registered when user is admin, but always in allowlist)
  "mcp__mitable__list_team_members",
  "mcp__mitable__query_org_metrics",
  "mcp__mitable__query_user_metrics",
  "mcp__mitable__query_session_summaries",
];

// Phase 2: all tools including write/mutate
const ALL_TOOLS = [
  ...READ_ONLY_TOOLS,
  "Write",
  "Edit",
  "Bash",
  "mcp__mitable__slack_send_message",
  "mcp__mitable__browser_navigate",
  "mcp__mitable__browser_click",
  "mcp__mitable__browser_type",
  "mcp__mitable__browser_select",
  "mcp__mitable__browser_execute_js",
  "mcp__mitable__browser_tab_open",
  "mcp__mitable__browser_tab_close",
  "mcp__mitable__browser_keyboard",
  // Google Workspace skills (write: send email, create folder, upload)
  "mcp__mitable__send_email",
  "mcp__mitable__create_drive_folder",
  "mcp__mitable__upload_to_drive",
  // Document generation skills (local: docx, pdf, xlsx, ics, save)
  "mcp__mitable__generate_document",
  "mcp__mitable__generate_spreadsheet",
  "mcp__mitable__create_calendar_event",
  "mcp__mitable__save_file_locally",
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
  type:
    | "result"
    | "tool_use"
    | "error"
    | "init"
    | "text_delta"
    | "assistant_text"
    | "plan_proposed";
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

  async approvePlan(conversationId: string, callbacks: AgentCallbacks): Promise<void> {
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

    // Read skills and memory from local filesystem
    const skills = await skillsStore.getRelevant();
    const memoryContent = await skillsStore.getMemoryContent();
    const systemPrompt = this.buildSystemPrompt(skills, isPlanPhase, memoryContent);

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
          const blocks =
            (
              msg as {
                message?: {
                  content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
                };
              }
            ).message?.content || [];
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
            message?: {
              content?: Array<{
                type: string;
                text?: string;
                name?: string;
                input?: Record<string, unknown>;
              }>;
            };
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

    const getMyActivityTool = tool(
      "get_my_activity",
      'Get the user\'s activity across ALL content types for a date range: work sessions, meeting notes (Granola, Fireflies), activity blocks, daily summaries, and documents created. Returns a compact overview — use get_activity_detail to drill into any specific item. Max 31 days per query; omitting dates returns the last 30 days. For broad questions ("what do I do?", "overview of me"), make multiple calls to cover 2-3 months, then synthesize. If a query returns sparse results, expand the date range further before concluding the user has little data.',
      {
        start_date: z.string().optional().describe("Start date YYYY-MM-DD (default: 30 days ago)"),
        end_date: z.string().optional().describe("End date YYYY-MM-DD (default: today)"),
      },
      async ({ start_date, end_date }) => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const params = new URLSearchParams();
          if (start_date) params.set("start_date", start_date);
          if (end_date) params.set("end_date", end_date);
          const qs = params.toString() ? `?${params.toString()}` : "";
          const res = await fetch(`${apiUrl}/api/agent/tools/activity${qs}`, { headers });
          const text = await res.text();
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const getActivityDetailTool = tool(
      "get_activity_detail",
      "Drill into a specific activity item by ID. Use after get_my_activity to get full details: meeting transcripts, session task breakdowns, or document content.",
      {
        id: z.string().describe("The ID of the item (from get_my_activity results)"),
        type: z
          .enum(["block", "session", "document"])
          .describe(
            "Type of item: 'block' for activity/meeting blocks, 'session' for work sessions, 'document' for created docs"
          ),
      },
      async ({ id, type }) => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const res = await fetch(
            `${apiUrl}/api/agent/tools/activity-detail?id=${encodeURIComponent(id)}&type=${type}`,
            { headers }
          );
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

    // Browser Bridge tools
    const browserStatusTool = tool(
      "browser_status",
      "Check if the Mitable Chrome Extension is connected. Returns connection status.",
      {},
      async () => {
        const connected = browserBridgeService.isConnected();
        const info = browserBridgeService.getConnectionInfo();
        const text = connected
          ? `Chrome extension connected (port ${info.port})`
          : "Chrome extension not connected. The user needs to install and enable the Mitable Chrome Extension.";
        return { content: [{ type: "text" as const, text }] };
      }
    );

    const browserNavigateTool = tool(
      "browser_navigate",
      "Navigate to a URL in the user's Chrome browser. Can target a specific tab or the active tab. IMPORTANT: Always confirm with the user before navigating.",
      {
        url: z.string().describe("The URL to navigate to"),
        tabId: z
          .number()
          .optional()
          .describe("Specific tab ID to navigate (from browser_get_tabs). Omit for active tab."),
        waitForLoad: z
          .boolean()
          .optional()
          .describe("Wait for page to finish loading (default true)"),
      },
      async ({ url, tabId, waitForLoad }) => {
        const response = await browserBridgeService.sendCommand("navigate", {
          url,
          tabId,
          waitForLoad: waitForLoad ?? true,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { url: string; title: string; tabId: number };
        return {
          content: [
            {
              type: "text" as const,
              text: `Navigated to: ${result.title}\nURL: ${result.url}\nTab ID: ${result.tabId}`,
            },
          ],
        };
      }
    );

    const browserExtractTool = tool(
      "browser_extract",
      "Extract content from the current page in the user's Chrome browser. Can extract plain text or structured data (headings, links, etc.).",
      {
        tabId: z
          .number()
          .optional()
          .describe("Specific tab ID (from browser_get_tabs). Omit for active tab."),
        mode: z
          .enum(["text", "structured"])
          .optional()
          .describe(
            "'text' for plain text content, 'structured' for headings/links/text (default 'text')"
          ),
        selector: z.string().optional().describe("CSS selector to extract from a specific element"),
      },
      async ({ tabId, mode, selector }) => {
        const response = await browserBridgeService.sendCommand("extract", {
          tabId,
          mode: mode ?? "text",
          selector,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { content: string };
        return { content: [{ type: "text" as const, text: result.content }] };
      }
    );

    const browserGetTabsTool = tool(
      "browser_get_tabs",
      "List all open tabs in the user's Chrome browser with their URLs, titles, and IDs.",
      {},
      async () => {
        const response = await browserBridgeService.sendCommand("get_tabs", {});
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as {
          tabs: Array<{ id: number; url: string; title: string; active: boolean }>;
        };
        const tabList = result.tabs
          .map((t) => `${t.active ? "→ " : "  "}[${t.id}] ${t.title}\n    ${t.url}`)
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `Open tabs (${result.tabs.length}):\n${tabList}`,
            },
          ],
        };
      }
    );

    const browserClickTool = tool(
      "browser_click",
      "Click an element in the user's Chrome browser. Finds by CSS selector, with optional text content fallback. IMPORTANT: Always confirm with the user before clicking.",
      {
        selector: z.string().describe("CSS selector for the element to click"),
        text: z
          .string()
          .optional()
          .describe("Visible text content to match as fallback if selector fails"),
        tabId: z
          .number()
          .optional()
          .describe("Specific tab ID (from browser_get_tabs). Omit for active tab."),
      },
      async ({ selector, text, tabId }) => {
        const response = await browserBridgeService.sendCommand("click", { selector, text, tabId });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as {
          clicked: boolean;
          tagName: string;
          textContent: string;
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Clicked <${result.tagName}>${result.textContent ? `: "${result.textContent}"` : ""}`,
            },
          ],
        };
      }
    );

    const browserTypeTool = tool(
      "browser_type",
      "Type text into an input or textarea element in the user's Chrome browser. IMPORTANT: Always confirm with the user before typing.",
      {
        selector: z.string().describe("CSS selector for the input element"),
        text: z.string().describe("Text to type into the element"),
        clear: z.boolean().optional().describe("Clear the field before typing (default true)"),
        tabId: z
          .number()
          .optional()
          .describe("Specific tab ID (from browser_get_tabs). Omit for active tab."),
      },
      async ({ selector, text, clear, tabId }) => {
        const response = await browserBridgeService.sendCommand("type", {
          selector,
          text,
          clear: clear ?? true,
          tabId,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { typed: boolean; tagName: string; value: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Typed into <${result.tagName}>. Current value: "${result.value}"`,
            },
          ],
        };
      }
    );

    const browserWaitTool = tool(
      "browser_wait",
      "Wait for an element to appear in the DOM of the user's Chrome browser. Polls every 200ms until found or timeout.",
      {
        selector: z.string().describe("CSS selector to wait for"),
        timeout: z
          .number()
          .optional()
          .describe("Maximum wait time in milliseconds (default 10000)"),
        tabId: z
          .number()
          .optional()
          .describe("Specific tab ID (from browser_get_tabs). Omit for active tab."),
      },
      async ({ selector, timeout, tabId }) => {
        const response = await browserBridgeService.sendCommand(
          "wait",
          { selector, timeout: timeout ?? 10000, tabId },
          (timeout ?? 10000) + 5000 // Bridge timeout slightly longer than element timeout
        );
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { found: boolean; tagName: string; textContent: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Found <${result.tagName}>${result.textContent ? `: "${result.textContent}"` : ""}`,
            },
          ],
        };
      }
    );

    const browserScreenshotTool = tool(
      "browser_screenshot",
      "Take a screenshot of the visible area in the user's Chrome browser. Returns an image the LLM can see directly.",
      {
        tabId: z
          .number()
          .optional()
          .describe(
            "Specific tab ID to screenshot. Will activate the tab first. Omit for current visible tab."
          ),
        quality: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("JPEG quality 1-100 (default 80). Lower = smaller file."),
        format: z
          .enum(["png", "jpeg"])
          .optional()
          .describe("Image format (default 'jpeg'). JPEG is smaller, PNG is lossless."),
      },
      async ({ tabId, quality, format }) => {
        const response = await browserBridgeService.sendCommand(
          "screenshot",
          { tabId, quality: quality ?? 80, format: format ?? "jpeg" },
          20000
        );
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { type: string; data: string; mimeType: string };
        return {
          content: [{ type: "image" as const, data: result.data, mimeType: result.mimeType }],
        };
      }
    );

    const browserScrollTool = tool(
      "browser_scroll",
      "Scroll the page in the user's Chrome browser. Can scroll by direction, to a specific element, or to top/bottom.",
      {
        direction: z.enum(["up", "down"]).optional().describe("Scroll direction (default 'down')"),
        amount: z.number().optional().describe("Pixels to scroll (default 80% of viewport height)"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector to scroll into view (overrides direction/amount)"),
        position: z
          .enum(["top", "bottom"])
          .optional()
          .describe("Scroll to absolute position (overrides direction/amount)"),
        tabId: z.number().optional().describe("Specific tab ID. Omit for active tab."),
      },
      async ({ direction, amount, selector, position, tabId }) => {
        const response = await browserBridgeService.sendCommand("scroll", {
          direction,
          amount,
          selector,
          position,
          tabId,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as {
          scrollY: number;
          scrollHeight: number;
          tagName?: string;
          textContent?: string;
        };
        const pos = `${Math.round(result.scrollY)}/${result.scrollHeight}px`;
        const extra = result.tagName ? ` — scrolled to <${result.tagName}>` : "";
        return {
          content: [{ type: "text" as const, text: `Scrolled. Position: ${pos}${extra}` }],
        };
      }
    );

    const browserHoverTool = tool(
      "browser_hover",
      "Hover over an element in the user's Chrome browser to trigger hover menus, tooltips, or dropdowns.",
      {
        selector: z.string().describe("CSS selector for the element to hover over"),
        tabId: z.number().optional().describe("Specific tab ID. Omit for active tab."),
      },
      async ({ selector, tabId }) => {
        const response = await browserBridgeService.sendCommand("hover", { selector, tabId });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as {
          hovered: boolean;
          tagName: string;
          textContent: string;
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Hovered <${result.tagName}>${result.textContent ? `: "${result.textContent}"` : ""}`,
            },
          ],
        };
      }
    );

    const browserReadElementTool = tool(
      "browser_read_element",
      "Inspect an element's properties in the user's Chrome browser (disabled state, value, href, class, bounding rect, etc.).",
      {
        selector: z.string().describe("CSS selector for the element to inspect"),
        properties: z
          .array(z.string())
          .optional()
          .describe(
            "Properties to read (defaults: tagName, id, className, textContent, value, href, src, disabled, checked, type, placeholder). Special: 'boundingRect', 'computedStyle'."
          ),
        tabId: z.number().optional().describe("Specific tab ID. Omit for active tab."),
      },
      async ({ selector, properties, tabId }) => {
        const response = await browserBridgeService.sendCommand("read_element", {
          selector,
          properties,
          tabId,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { tagName: string; attributes: Record<string, unknown> };
        return {
          content: [
            {
              type: "text" as const,
              text: `<${result.tagName}> properties:\n${JSON.stringify(result.attributes, null, 2)}`,
            },
          ],
        };
      }
    );

    const browserSelectTool = tool(
      "browser_select",
      "Select an option from a <select> dropdown in the user's Chrome browser. Matches by option value or visible text. IMPORTANT: Always confirm with the user before selecting.",
      {
        selector: z.string().describe("CSS selector for the <select> element"),
        value: z.string().describe("Option value or visible text to select"),
        tabId: z.number().optional().describe("Specific tab ID. Omit for active tab."),
      },
      async ({ selector, value, tabId }) => {
        const response = await browserBridgeService.sendCommand("select", {
          selector,
          value,
          tabId,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as {
          selected: boolean;
          tagName: string;
          textContent: string;
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Selected "${result.textContent}" from dropdown`,
            },
          ],
        };
      }
    );

    const browserExecuteJsTool = tool(
      "browser_execute_js",
      "Execute arbitrary JavaScript in the user's Chrome browser tab. Runs in the MAIN world with access to page variables. IMPORTANT: Always confirm with the user before executing.",
      {
        code: z
          .string()
          .describe("JavaScript code to execute. Can use return statement for a value."),
        tabId: z.number().optional().describe("Specific tab ID. Omit for active tab."),
      },
      async ({ code, tabId }) => {
        const response = await browserBridgeService.sendCommand("execute_js", { code, tabId });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { result: string };
        return {
          content: [{ type: "text" as const, text: `Result: ${result.result}` }],
        };
      }
    );

    const browserTabOpenTool = tool(
      "browser_tab_open",
      "Open a new tab in the user's Chrome browser. IMPORTANT: Always confirm with the user before opening.",
      {
        url: z.string().optional().describe("URL to navigate to. Omit for a blank new tab."),
      },
      async ({ url }) => {
        const response = await browserBridgeService.sendCommand("tab_open", { url }, 35000);
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { tabId: number; url: string; title: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Opened tab [${result.tabId}]: ${result.title}\nURL: ${result.url}`,
            },
          ],
        };
      }
    );

    const browserTabCloseTool = tool(
      "browser_tab_close",
      "Close a tab in the user's Chrome browser. IMPORTANT: Always confirm with the user before closing.",
      {
        tabId: z.number().describe("Tab ID to close (from browser_get_tabs)"),
      },
      async ({ tabId: closeTabId }) => {
        const response = await browserBridgeService.sendCommand("tab_close", { tabId: closeTabId });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        return {
          content: [{ type: "text" as const, text: `Closed tab ${closeTabId}` }],
        };
      }
    );

    const browserKeyboardTool = tool(
      "browser_keyboard",
      "Send keyboard events to the focused element in the user's Chrome browser. Useful for pressing Enter, Escape, Tab, arrow keys, or keyboard shortcuts. IMPORTANT: Always confirm with the user before sending.",
      {
        key: z
          .string()
          .describe("Key to press (e.g., 'Enter', 'Escape', 'Tab', 'ArrowDown', 'a', 'Delete')"),
        modifiers: z
          .array(z.enum(["ctrl", "shift", "alt", "meta"]))
          .optional()
          .describe("Modifier keys to hold (e.g., ['ctrl', 'shift'])"),
        tabId: z.number().optional().describe("Specific tab ID. Omit for active tab."),
      },
      async ({ key, modifiers, tabId }) => {
        const response = await browserBridgeService.sendCommand("keyboard", {
          key,
          modifiers,
          tabId,
        });
        if (!response.success) {
          return { content: [{ type: "text" as const, text: `Error: ${response.error}` }] };
        }
        const result = response.payload as { sent: boolean; tagName: string; textContent: string };
        const modStr = modifiers?.length ? `${modifiers.join("+")}+` : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `Sent ${modStr}${key} to <${result.tagName}>`,
            },
          ],
        };
      }
    );

    // ── Admin Analytics Tools (only registered for admin users) ──
    const adminTools = [];

    if (authManager.isAdmin()) {
      logger.info("Admin role detected — registering analytics tools");

      const listTeamMembersTool = tool(
        "list_team_members",
        "List all tracked team members in the organization with names and roles. Call this first to know who you can query.",
        {},
        async () => {
          try {
            const freshToken = authManager.getAccessToken();
            const headers = {
              ...authHeaders,
              ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
            };
            const res = await fetch(`${apiUrl}/api/agent/tools/admin/team-members`, { headers });
            const text = await res.text();
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
          }
        }
      );

      const queryOrgMetricsTool = tool(
        "query_org_metrics",
        "Get org-level productivity metrics for a date range (max 31 days). Returns averages, category breakdown, and daily trend.",
        {
          start_date: z.string().describe("Start date YYYY-MM-DD"),
          end_date: z.string().describe("End date YYYY-MM-DD"),
        },
        async ({ start_date, end_date }) => {
          try {
            const freshToken = authManager.getAccessToken();
            const headers = {
              ...authHeaders,
              ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
            };
            const res = await fetch(
              `${apiUrl}/api/agent/tools/admin/org-metrics?start_date=${start_date}&end_date=${end_date}`,
              { headers }
            );
            const text = await res.text();
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
          }
        }
      );

      const queryUserMetricsTool = tool(
        "query_user_metrics",
        "Get detailed productivity metrics for a specific team member (max 31 days). Returns daily breakdown, categories, and day summaries. Use the person's name (e.g. 'Emily' or 'Emily Chen').",
        {
          user_name: z.string().describe("Name of the team member (e.g. 'Emily' or 'Emily Chen')"),
          start_date: z.string().describe("Start date YYYY-MM-DD"),
          end_date: z.string().describe("End date YYYY-MM-DD"),
        },
        async ({ user_name, start_date, end_date }) => {
          try {
            const freshToken = authManager.getAccessToken();
            const headers = {
              ...authHeaders,
              ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
            };
            const res = await fetch(
              `${apiUrl}/api/agent/tools/admin/user-metrics?user_name=${encodeURIComponent(user_name)}&start_date=${start_date}&end_date=${end_date}`,
              { headers }
            );
            const text = await res.text();
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
          }
        }
      );

      const querySessionSummariesTool = tool(
        "query_session_summaries",
        "Get individual session summaries for a team member (max 31 days, 20 sessions). Returns session titles, durations, and narrative summaries.",
        {
          user_name: z.string().describe("Name of the team member"),
          start_date: z.string().describe("Start date YYYY-MM-DD"),
          end_date: z.string().describe("End date YYYY-MM-DD"),
        },
        async ({ user_name, start_date, end_date }) => {
          try {
            const freshToken = authManager.getAccessToken();
            const headers = {
              ...authHeaders,
              ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
            };
            const res = await fetch(
              `${apiUrl}/api/agent/tools/admin/session-summaries?user_name=${encodeURIComponent(user_name)}&start_date=${start_date}&end_date=${end_date}`,
              { headers }
            );
            const text = await res.text();
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
          }
        }
      );

      adminTools.push(
        listTeamMembersTool,
        queryOrgMetricsTool,
        queryUserMetricsTool,
        querySessionSummariesTool
      );
    }

    // ── Google Workspace Skills ────────────────────────────────────────

    const checkGoogleAuthTool = tool(
      "google_auth_status",
      "Check if the user has connected their Google account (Gmail, Drive, Docs). Returns { connected, email, needsReconnect }. ALWAYS call this before using any Google skill. If not connected, tell the user to connect Google in Settings > Integrations.",
      {},
      async () => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const res = await fetch(`${apiUrl}/api/agent/skills/google-auth-status`, {
            headers,
          });
          return { content: [{ type: "text" as const, text: await res.text() }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const sendEmailTool = tool(
      "send_email",
      "Send an email via the user's Gmail account. Supports optional file attachment via documentId (from generate_document). IMPORTANT: Always show the user a draft (to, subject, body, attachment name if any) and get explicit confirmation before calling this tool.",
      {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body text (plain text)"),
        documentId: z
          .string()
          .optional()
          .describe("Attach a generated document (documentId from generate_document)"),
      },
      async ({ to, subject, body, documentId }) => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };

          // If there's an attachment, read from local temp store and send as base64
          let attachmentPayload:
            | { fileName: string; mimeType: string; contentBase64: string }
            | undefined;
          if (documentId) {
            const doc = getTempDocument(documentId);
            if (!doc) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Error: Attachment document not found or expired. Generate it again with generate_document.",
                  },
                ],
              };
            }
            attachmentPayload = {
              fileName: doc.fileName,
              mimeType: doc.mimeType,
              contentBase64: doc.buffer.toString("base64"),
            };
          }

          const res = await fetch(`${apiUrl}/api/agent/skills/send-email`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              to,
              subject,
              body,
              ...(attachmentPayload ? { attachment: attachmentPayload } : {}),
            }),
          });
          return { content: [{ type: "text" as const, text: await res.text() }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const createDriveFolderTool = tool(
      "create_drive_folder",
      "Create a new folder in the user's Google Drive. Returns the folder ID and URL.",
      {
        name: z.string().describe("Folder name"),
        parentFolderId: z.string().optional().describe("Parent folder ID (omit for root of Drive)"),
      },
      async ({ name, parentFolderId }) => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const res = await fetch(`${apiUrl}/api/agent/skills/create-drive-folder`, {
            method: "POST",
            headers,
            body: JSON.stringify({ name, parentFolderId }),
          });
          return { content: [{ type: "text" as const, text: await res.text() }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const listDriveFoldersTool = tool(
      "list_drive_folders",
      "List folders in the user's Google Drive. Useful for finding where to save files.",
      {},
      async () => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };
          const res = await fetch(`${apiUrl}/api/agent/skills/list-drive-folders`, {
            headers,
          });
          return { content: [{ type: "text" as const, text: await res.text() }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const uploadToDriveTool = tool(
      "upload_to_drive",
      "Upload a file to Google Drive. Provide EITHER a documentId (from generate_document) OR raw contentBase64. Prefer documentId to avoid large payloads.",
      {
        documentId: z
          .string()
          .optional()
          .describe("The documentId from generate_document (preferred)"),
        fileName: z.string().describe("File name including extension"),
        mimeType: z
          .string()
          .optional()
          .describe("MIME type (auto-detected from documentId if omitted)"),
        contentBase64: z
          .string()
          .optional()
          .describe("Base64-encoded file content (only if no documentId)"),
        folderId: z.string().optional().describe("Drive folder ID to upload into (omit for root)"),
      },
      async ({ documentId, fileName, mimeType, contentBase64, folderId }) => {
        try {
          const freshToken = authManager.getAccessToken();
          const headers = {
            ...authHeaders,
            ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          };

          let actualBase64 = contentBase64;
          let resolvedMimeType = mimeType;

          // Read from local on-device temp store first
          if (documentId && !actualBase64) {
            const doc = getTempDocument(documentId);
            if (doc) {
              actualBase64 = doc.buffer.toString("base64");
              resolvedMimeType = resolvedMimeType || doc.mimeType;
            } else {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "Error: Document not found or expired. Generate it again with generate_document.",
                  },
                ],
              };
            }
          }

          if (!actualBase64) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: Provide either documentId or contentBase64",
                },
              ],
            };
          }

          const res = await fetch(`${apiUrl}/api/agent/skills/upload-to-drive`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              fileName,
              mimeType:
                resolvedMimeType ||
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              contentBase64: actualBase64,
              folderId,
            }),
          });
          return { content: [{ type: "text" as const, text: await res.text() }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const generateDocumentTool = tool(
      "generate_document",
      "Generate a document from content. Supports Word (.docx), PDF (.pdf), or Google Doc. For docx/pdf, generates locally on-device and returns a documentId reference — use this ID with save_file_locally, upload_to_drive, or send_email. For Google Doc, creates it directly in Drive and returns the URL.",
      {
        title: z.string().describe("Document title"),
        content: z
          .string()
          .describe("Document content (supports markdown: headings, bold, italic, bullets)"),
        format: z
          .enum(["docx", "pdf", "google-doc"])
          .optional()
          .describe("Output format: 'docx' (default), 'pdf', or 'google-doc'"),
        folderId: z
          .string()
          .optional()
          .describe("Google Drive folder ID to save into (optional, for google-doc)"),
      },
      async ({ title, content, format, folderId }) => {
        try {
          const effectiveFormat = format || "docx";

          // Google Doc format needs backend (requires Google OAuth)
          if (effectiveFormat === "google-doc") {
            const freshToken = authManager.getAccessToken();
            const headers = {
              ...authHeaders,
              ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
            };
            const res = await fetch(`${apiUrl}/api/agent/skills/create-google-doc`, {
              method: "POST",
              headers,
              body: JSON.stringify({ title, content, folderId }),
            });
            return { content: [{ type: "text" as const, text: await res.text() }] };
          }

          // Local generation
          const generator = effectiveFormat === "pdf" ? generatePdfLocally : generateDocxLocally;
          const { documentId, fileName } = await generator(title, content);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  documentId,
                  fileName,
                  note: "Document generated locally. Use documentId with save_file_locally or upload_to_drive.",
                }),
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const saveFileLocallyTool = tool(
      "save_file_locally",
      "Save a previously generated document to the user's local machine. Use the documentId returned by generate_document. Do NOT pass file content directly — always use the documentId reference.",
      {
        documentId: z.string().describe("The documentId returned by generate_document"),
        fileName: z
          .string()
          .optional()
          .describe("Override file name (default: name from generate_document)"),
        location: z
          .enum(["desktop", "documents", "downloads"])
          .optional()
          .describe("Where to save: 'desktop' (default), 'documents', or 'downloads'"),
      },
      async ({ documentId, fileName, location }) => {
        try {
          const { app: electronApp } = await import("electron");
          const { writeFile, mkdir } = await import("fs/promises");
          const { join: pathJoin } = await import("path");

          // Read from local on-device temp store (no network call)
          const doc = getTempDocument(documentId);
          if (!doc) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: Document not found or expired. Generate it again with generate_document.",
                },
              ],
            };
          }

          const actualFileName = fileName || doc.fileName;
          const loc = location || "desktop";
          let basePath: string;
          switch (loc) {
            case "documents":
              basePath = electronApp.getPath("documents");
              break;
            case "downloads":
              basePath = electronApp.getPath("downloads");
              break;
            default:
              basePath = electronApp.getPath("desktop");
          }

          await mkdir(basePath, { recursive: true });
          const filePath = pathJoin(basePath, actualFileName);
          await writeFile(filePath, doc.buffer);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  filePath,
                  location: loc,
                  fileName: actualFileName,
                }),
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const generateSpreadsheetTool = tool(
      "generate_spreadsheet",
      "Generate an Excel (.xlsx) spreadsheet from structured data. Returns a documentId — use with save_file_locally, upload_to_drive, or send_email as attachment.",
      {
        title: z.string().describe("Spreadsheet title (used as filename)"),
        headers: z.array(z.string()).describe("Column header names"),
        rows: z
          .array(z.array(z.string()))
          .describe("Array of rows, each row is an array of cell values"),
        sheetName: z.string().optional().describe("Worksheet name (defaults to title)"),
      },
      async ({ title, headers, rows, sheetName }) => {
        try {
          const { documentId, fileName } = await generateSpreadsheetLocally(
            title,
            headers,
            rows,
            sheetName
          );
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  documentId,
                  fileName,
                  rowCount: rows.length,
                  note: "Spreadsheet generated locally. Use documentId with save_file_locally or upload_to_drive.",
                }),
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    const createCalendarEventTool = tool(
      "create_calendar_event",
      "Create a calendar event (.ics file) that can be saved locally, uploaded to Drive, or emailed as an attachment. The recipient can open the .ics file to add the event to their calendar app.",
      {
        title: z.string().describe("Event title/summary"),
        start: z.string().describe("Start time as ISO 8601 datetime (e.g. '2026-03-25T10:00:00')"),
        end: z.string().describe("End time as ISO 8601 datetime (e.g. '2026-03-25T11:00:00')"),
        description: z.string().optional().describe("Event description or agenda"),
        location: z
          .string()
          .optional()
          .describe("Event location (physical address or virtual meeting link)"),
        attendees: z
          .array(z.string())
          .optional()
          .describe("Email addresses of attendees to invite"),
      },
      async ({ title, start, end, description, location, attendees }) => {
        try {
          const { documentId, fileName } = await generateCalendarEventLocally({
            title,
            start,
            end,
            description,
            location,
            attendees,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  documentId,
                  fileName,
                  note: "Calendar event created locally. Use documentId with save_file_locally to download, or send_email to invite attendees.",
                }),
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
        }
      }
    );

    return createSdkMcpServer({
      name: "mitable",
      tools: [
        getMyActivityTool,
        getActivityDetailTool,
        slackChannelsTool,
        slackSendTool,
        browserStatusTool,
        browserNavigateTool,
        browserExtractTool,
        browserGetTabsTool,
        browserClickTool,
        browserTypeTool,
        browserWaitTool,
        browserScreenshotTool,
        browserScrollTool,
        browserHoverTool,
        browserReadElementTool,
        browserSelectTool,
        browserExecuteJsTool,
        browserTabOpenTool,
        browserTabCloseTool,
        browserKeyboardTool,
        // Google Workspace skills
        checkGoogleAuthTool,
        sendEmailTool,
        createDriveFolderTool,
        listDriveFoldersTool,
        uploadToDriveTool,
        // Document generation skills (all local except google-doc)
        generateDocumentTool,
        generateSpreadsheetTool,
        createCalendarEventTool,
        saveFileLocallyTool,
        ...adminTools,
      ],
    });
  }

  private buildSystemPrompt(
    skills: AgentSkill[],
    isPlanPhase: boolean,
    memoryContent?: string
  ): string {
    const skillsSection =
      skills.length > 0
        ? skills.map((s) => `### ${s.name}\n${s.contextSummary}`).join("\n\n")
        : "No skills available yet. The user hasn't captured enough work sessions for skill generation.";

    const memorySection = memoryContent
      ? `## Persistent Memory
You have a memory directory at ~/.mitable/agent/memory/. Files here persist across conversations.
- Read MEMORY.md at the start of tasks for context from previous sessions
- Use Write/Edit tools to save important learnings, user preferences, and patterns
- Keep entries concise and organized by topic
- The user can also edit these files directly

### Current Memory
${memoryContent}`
      : "";

    const adminSection = authManager.isAdmin()
      ? `
7. **Team Analytics** (admin-only): Query any team member's productivity data
   - \`list_team_members\` — see who's in the org
   - \`query_user_metrics\` — get a specific person's daily metrics, categories, accomplishments
   - \`query_org_metrics\` — get org-wide aggregated trends
   - \`query_session_summaries\` — get a person's session summaries with task breakdowns
   - All queries are capped at 31 days per call. For longer periods, make multiple queries.
   - Use \`list_team_members\` first to resolve names before querying metrics.`
      : "";

    const adminRules = authManager.isAdmin()
      ? `
- You have admin access: you can query ANY team member's data using the analytics tools
- When asked about a specific person, call list_team_members first, then query their metrics
- For comparisons between people, make separate query_user_metrics calls for each person
- Always reference actual numbers from the tool results — never fabricate data
- Date ranges are capped at 31 days per query. For "last 3 months", make 3 separate monthly queries`
      : "";

    const basePrompt = `You are Mitable Agent — a personal AI assistant that helps users take action based on their captured work context.

## Your Capabilities
1. **File operations**: Read, write, and edit files on the user's machine
2. **Terminal**: Run shell commands via Bash
3. **Web**: Search the web and fetch pages
4. **Work context**: Access the user's captured work sessions, activity data, and daily summaries via Mitable tools
5. **Integrations**: Send Slack messages, send emails via Gmail
6. **Google Workspace**: Send emails, create Drive folders, upload files to Drive, generate Word docs or Google Docs — all using the user's connected Google account
7. **Local file system**: Save generated documents to the user's Desktop, Documents, or Downloads folder
8. **Browser control**: Navigate, screenshot, scroll, click, type, select, hover, keyboard, inspect elements, execute JS, manage tabs, and extract content in Chrome (requires Mitable Chrome Extension)${adminSection}

${memorySection}

## User's Work Skills (auto-generated, user-editable)
Skills are stored at ~/.mitable/agent/skills/ as markdown files.
The user may have edited these to correct or refine them.

${skillsSection}

## Critical: Use Mitable Tools for Work Data
- NEVER use Read, Bash, Glob, or Grep to access work data. Do NOT read files from .claude/projects/ or tool-result caches — these are stale artifacts from previous conversations, not live data.
- ALWAYS use get_my_activity and get_activity_detail for ANY question about the user's work, schedule, meetings, activity, or profile. These are live API calls that return fresh, complete data.
- If get_my_activity returns an error, retry or inform the user. Do NOT fall back to reading cached files.

## Rules

### Data Retrieval
- When the user asks about their work, ALWAYS call get_my_activity as your FIRST action — it returns ALL content types (sessions, meeting notes, activity blocks, documents) for a date range
- Use get_activity_detail to drill into specific items when more detail is needed (e.g. meeting transcripts, task breakdowns, document content)
- When asked about work patterns or time spent, use get_my_activity to give data-driven answers across ALL activity types, not just sessions
- Pay attention to dailySummaries — they contain pre-computed metrics, category breakdowns, and accomplishments that give you a broad picture without needing raw detail

### Broad Questions (overview, profile, "what do I do?", work patterns)
- Call get_my_activity immediately with a broad range. Start with the default 30 days.
- If the results are sparse or the question demands more history, make additional calls for earlier months (e.g. 60-90 days back). The 31-day cap is per-query, not per-conversation — paginate across months.
- NEVER conclude the user has little data after a single query. Always expand the search window before saying data is thin.
- Synthesize across ALL sources: daily summaries (metrics, category breakdowns), meeting notes (Granola, Fireflies), work sessions, and documents. Build a rich, complete picture.
- For these questions, give a thorough and detailed response — the user is asking for depth, not brevity.

### Response Style
- For action-oriented requests (send a message, draft something, run a command): be concise and direct
- For analytical or reflective questions (overview, patterns, "tell me about my work"): be thorough and synthesize across data sources — the user wants insight, not a one-liner
- Match the user's communication style from their skills when drafting messages

### Google Workspace Workflow
- Before using ANY Google skill (send_email, create_drive_folder, upload_to_drive, generate_document with google-doc format), ALWAYS call google_auth_status first
- If the user is not connected, tell them: "You need to connect your Google account first. Go to Settings > Integrations > Gmail/Google Workspace and click Connect."
- If the token needs reconnection (needsReconnect: true), tell the user to reconnect in Settings
- For emails: ALWAYS draft the email first (show To, Subject, and Body to the user in chat) and ask for explicit confirmation before calling send_email. If the user wants edits, apply them and show the updated draft before sending.
- For document generation: describe what you'll create and confirm with the user. After generating, report the file location or Drive URL.
- For multi-step workflows (e.g. "create a doc, email it, and save to Drive"): break them down, confirm the plan, then execute step by step. Report progress after each step.

### Safety
- For integration actions (Slack, Linear, Gmail, Drive), ALWAYS confirm the message/file content and target with the user before sending
- Never send emails or upload files without user confirmation${adminRules}`;

    return isPlanPhase ? basePrompt + PLAN_MODE_INSTRUCTIONS : basePrompt;
  }
}

export const agentSdkService = new AgentSdkService();
