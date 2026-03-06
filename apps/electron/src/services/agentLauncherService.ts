/**
 * Agent Launcher Service
 *
 * Manages agent task lifecycle from Electron's main process.
 * Uses the Claude Agent SDK to launch Claude Code headlessly with
 * in-process MCP tools for searching Mitable work context.
 *
 * For non-SDK agents (Cursor, generic CLI): spawns via child_process.
 */

import { randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import { createLogger } from "../lib/logger";
import { authManager } from "./authManager";
import { contextFileService } from "./contextFileService";
import type { BrowserWindow } from "electron";

const logger = createLogger("AgentLauncher");

export type AgentType = "claude-code" | "cursor" | "generic-cli";
export type TaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentTaskParams {
  taskDescription: string;
  projectDirectory: string;
  agentType: AgentType;
  enableContextTools: boolean;
  permissionMode: "plan" | "acceptEdits" | "bypassPermissions";
  costCap?: number;
  model?: string;
}

export interface AgentTask {
  taskId: string;
  description: string;
  agentType: AgentType;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  costUsd?: number;
  durationMs?: number;
  error?: string;
  abortController?: AbortController;
}

class AgentLauncherService {
  private activeTasks: Map<string, AgentTask> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private taskHistory: AgentTask[] = [];
  private consoleWindow: BrowserWindow | null = null;

  setConsoleWindow(window: BrowserWindow | null) {
    this.consoleWindow = window;
  }

  async launchTask(params: AgentTaskParams): Promise<{ taskId: string; error?: string }> {
    const taskId = randomUUID();
    const abortController = new AbortController();

    const task: AgentTask = {
      taskId,
      description: params.taskDescription,
      agentType: params.agentType,
      status: "running",
      startedAt: Date.now(),
      abortController,
    };

    this.activeTasks.set(taskId, task);
    logger.info(`Launching ${params.agentType} task ${taskId}: "${params.taskDescription.slice(0, 80)}"`);

    if (params.agentType === "claude-code") {
      this.runClaudeCodeTask(taskId, params, abortController);
    } else {
      this.runExternalAgentTask(taskId, params, abortController);
    }

    return { taskId };
  }

  private async runClaudeCodeTask(
    taskId: string,
    params: AgentTaskParams,
    abortController: AbortController
  ): Promise<void> {
    try {
      // Dynamic import — the SDK is ESM-only
      const { query, createSdkMcpServer, tool } = await import(
        "@anthropic-ai/claude-agent-sdk"
      );
      const { z } = await import("zod");

      // Build in-process MCP server with context search tools
      const mcpServers: Record<string, unknown> = {};

      if (params.enableContextTools) {
        const mitableServer = createSdkMcpServer({
          name: "mitable",
          tools: [
            tool(
              "search_work_context",
              "Search the user's captured work history for context relevant to a query. " +
                "Returns matching activity descriptions, session summaries, and workstreams. " +
                "Use this when you need to understand what the user has been working on.",
              { query: z.string().describe("What to search for in work history"), days: z.number().optional().describe("Limit to last N days") },
              async ({ query: searchQuery, days }) => {
                try {
                  const res = await authManager.authenticatedFetch("/api/context/search", {
                    method: "POST",
                    body: JSON.stringify({ query: searchQuery, days, topK: 10 }),
                  });
                  const data = await res.json();
                  const text = data.chunks
                    ?.map((c: { sessionName: string; chunkType: string; text: string; similarity: number }) =>
                      `[${c.sessionName || "Session"} | ${c.chunkType} | similarity: ${c.similarity.toFixed(2)}]\n${c.text}`
                    )
                    .join("\n\n---\n\n") || "No results found.";
                  return { content: [{ type: "text" as const, text }] };
                } catch (err) {
                  return { content: [{ type: "text" as const, text: `Error searching context: ${err}` }], isError: true };
                }
              }
            ),
            tool(
              "get_current_activity",
              "Get what the user is currently working on right now.",
              {},
              async () => {
                try {
                  const res = await authManager.authenticatedFetch("/api/context/current");
                  const data = await res.json();
                  const text = data.activeSession
                    ? `Currently working on: ${data.activeSession.name || "Unnamed session"} (status: ${data.activeSession.status})`
                    : "No active session right now.";
                  return { content: [{ type: "text" as const, text }] };
                } catch (err) {
                  return { content: [{ type: "text" as const, text: `Error getting current activity: ${err}` }], isError: true };
                }
              }
            ),
            tool(
              "search_knowledge",
              "Search the user's integrated knowledge sources (Slack, Notion, GitHub) for relevant information.",
              {
                query: z.string().describe("What to search for"),
                sources: z.array(z.string()).optional().describe("Filter to specific sources: slack, notion, github"),
              },
              async ({ query: searchQuery, sources }) => {
                try {
                  const res = await authManager.authenticatedFetch("/api/context/knowledge", {
                    method: "POST",
                    body: JSON.stringify({ query: searchQuery, sources }),
                  });
                  const data = await res.json();
                  const text = data.results
                    ?.map((r: { source: string; channelName?: string; pageTitle?: string; text: string; score: number }) =>
                      `[${r.source}${r.channelName ? ` #${r.channelName}` : ""}${r.pageTitle ? ` "${r.pageTitle}"` : ""} | score: ${r.score.toFixed(2)}]\n${r.text}`
                    )
                    .join("\n\n---\n\n") || "No results found.";
                  return { content: [{ type: "text" as const, text }] };
                } catch (err) {
                  return { content: [{ type: "text" as const, text: `Error searching knowledge: ${err}` }], isError: true };
                }
              }
            ),
          ],
        });
        mcpServers["mitable"] = mitableServer;
      }

      // Build system prompt
      const contextAppend = params.enableContextTools
        ? "You have Mitable context tools available (search_work_context, get_current_activity, search_knowledge). " +
          "Use them if the task would benefit from knowing what the user has been working on. " +
          "Skip them if the task is self-contained."
        : undefined;

      const agentQuery = query({
        prompt: params.taskDescription,
        options: {
          cwd: params.projectDirectory,
          abortController,
          allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep", "Write"],
          permissionMode: params.permissionMode,
          includePartialMessages: true,
          mcpServers: mcpServers as Record<string, import("@anthropic-ai/claude-agent-sdk").McpServerConfig>,
          systemPrompt: {
            type: "preset" as const,
            preset: "claude_code" as const,
            append: contextAppend,
          },
          model: params.model,
          maxBudgetUsd: params.costCap,
          settingSources: ["project" as const],
        },
      });

      // Stream messages to renderer
      for await (const message of agentQuery) {
        if (abortController.signal.aborted) break;

        this.sendToConsole("agent:message", { taskId, message });

        // Capture result data
        if (message.type === "result") {
          const resultMsg = message as { type: "result"; subtype: string; total_cost_usd?: number; duration_ms?: number; result?: string; errors?: string[] };
          this.completeTask(taskId, {
            costUsd: resultMsg.total_cost_usd,
            durationMs: resultMsg.duration_ms,
            error: resultMsg.subtype !== "success" ? (resultMsg.errors?.join("; ") || resultMsg.subtype) : undefined,
          });
          return;
        }
      }

      // If we got here without a result message, mark complete
      if (this.activeTasks.has(taskId)) {
        this.completeTask(taskId, {});
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`Task ${taskId} failed:`, error);
      this.completeTask(taskId, { error });
    }
  }

  private async runExternalAgentTask(
    taskId: string,
    params: AgentTaskParams,
    abortController: AbortController
  ): Promise<void> {
    try {
      // Generate context file if requested
      let contextFilePath: string | undefined;
      if (params.enableContextTools) {
        try {
          contextFilePath = await contextFileService.generateContextFile(params.taskDescription);
          logger.info(`Context file generated at ${contextFilePath}`);
        } catch (err) {
          logger.warn("Failed to generate context file, proceeding without it:", err);
        }
      }

      // Build environment for the child process
      const env: Record<string, string | undefined> = { ...process.env };
      if (contextFilePath) {
        env.MITABLE_CONTEXT_FILE = contextFilePath;
      }
      env.MITABLE_API_URL = authManager.getApiBaseUrl();
      const token = authManager.getAccessToken();
      if (token) {
        env.MITABLE_AUTH_TOKEN = token;
      }

      // Determine command and args based on agent type
      let child: ChildProcess;
      const cwd = params.projectDirectory;

      if (params.agentType === "cursor") {
        child = spawn("cursor", ["--task", params.taskDescription], { cwd, env });
      } else {
        // generic-cli
        child = spawn("bash", ["-c", params.taskDescription], { cwd, env });
      }

      this.activeProcesses.set(taskId, child);
      const startTime = Date.now();

      // Abort handler — kill the child process on cancel
      const onAbort = () => child.kill("SIGTERM");
      abortController.signal.addEventListener("abort", onAbort);

      // Stream stdout to console renderer
      child.stdout?.on("data", (chunk: Buffer) => {
        this.sendToConsole("agent:message", {
          taskId,
          message: {
            type: "assistant",
            message: { content: [{ type: "text", text: chunk.toString() }] },
          },
        });
      });

      // Stream stderr to console renderer
      child.stderr?.on("data", (chunk: Buffer) => {
        this.sendToConsole("agent:message", {
          taskId,
          message: {
            type: "assistant",
            message: { content: [{ type: "text", text: `[stderr] ${chunk.toString()}` }] },
          },
        });
      });

      // Handle process exit
      child.on("close", (code) => {
        abortController.signal.removeEventListener("abort", onAbort);
        this.activeProcesses.delete(taskId);

        const durationMs = Date.now() - startTime;
        if (code === 0 || code === null) {
          this.completeTask(taskId, { durationMs });
        } else {
          this.completeTask(taskId, { durationMs, error: `Process exited with code ${code}` });
        }
      });

      // Handle spawn errors (e.g., command not found)
      child.on("error", (err) => {
        abortController.signal.removeEventListener("abort", onAbort);
        this.activeProcesses.delete(taskId);
        this.completeTask(taskId, { error: `Failed to spawn process: ${err.message}` });
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`External agent task ${taskId} failed:`, error);
      this.completeTask(taskId, { error });
    }
  }

  private completeTask(
    taskId: string,
    result: { costUsd?: number; durationMs?: number; error?: string }
  ) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    task.status = result.error ? "failed" : "completed";
    task.completedAt = Date.now();
    task.costUsd = result.costUsd;
    task.durationMs = result.durationMs || (Date.now() - task.startedAt);
    task.error = result.error;
    delete task.abortController;

    this.activeTasks.delete(taskId);
    this.taskHistory.unshift(task);
    // Keep history bounded
    if (this.taskHistory.length > 100) this.taskHistory.pop();

    logger.info(`Task ${taskId} ${task.status}${result.error ? `: ${result.error}` : ""}`);
    this.sendToConsole("agent:task-complete", {
      taskId,
      result: { costUsd: task.costUsd, durationMs: task.durationMs, error: task.error },
    });
  }

  async cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    task.abortController?.abort();
    // Kill child process if this is an external agent task
    const child = this.activeProcesses.get(taskId);
    if (child) {
      child.kill("SIGTERM");
      this.activeProcesses.delete(taskId);
    }
    task.status = "cancelled";
    task.completedAt = Date.now();
    task.durationMs = Date.now() - task.startedAt;
    delete task.abortController;

    this.activeTasks.delete(taskId);
    this.taskHistory.unshift(task);

    logger.info(`Task ${taskId} cancelled`);
    this.sendToConsole("agent:task-complete", {
      taskId,
      result: { durationMs: task.durationMs, error: "Cancelled by user" },
    });
    return { success: true };
  }

  getActiveTasks(): Omit<AgentTask, "abortController">[] {
    return Array.from(this.activeTasks.values()).map(({ abortController, ...rest }) => rest);
  }

  getTaskHistory(): Omit<AgentTask, "abortController">[] {
    return this.taskHistory;
  }

  cleanup(): void {
    logger.info("Cleaning up — cancelling all active tasks");
    for (const [taskId, task] of this.activeTasks) {
      task.abortController?.abort();
      // Kill child processes for external agent tasks
      const child = this.activeProcesses.get(taskId);
      if (child) {
        child.kill("SIGTERM");
      }
      task.status = "cancelled";
      task.completedAt = Date.now();
      this.taskHistory.unshift(task);
    }
    this.activeTasks.clear();
    this.activeProcesses.clear();
  }

  private sendToConsole(channel: string, data: unknown) {
    if (this.consoleWindow && !this.consoleWindow.isDestroyed()) {
      this.consoleWindow.webContents.send(channel, data);
    }
  }
}

export const agentLauncherService = new AgentLauncherService();
