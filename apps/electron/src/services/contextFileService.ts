/**
 * Context File Service
 *
 * Generates a markdown file at ~/.mitable/context.md containing the user's
 * recent work context (sessions, activities, knowledge sources).
 *
 * Non-SDK agents (Cursor, generic CLI) can't use in-process MCP servers,
 * so we deliver context as a file on disk that they can read.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createLogger } from "../lib/logger";
import { authManager } from "./authManager";

const logger = createLogger("ContextFile");
const MITABLE_DIR = path.join(os.homedir(), ".mitable");
const CONTEXT_FILE = path.join(MITABLE_DIR, "context.md");

interface WorkChunk {
  sessionName?: string;
  chunkType?: string;
  text: string;
  similarity?: number;
}

interface KnowledgeResult {
  source: string;
  channelName?: string;
  pageTitle?: string;
  text: string;
  score?: number;
}

class ContextFileService {
  /**
   * Fetch the user's work context and write it as formatted markdown.
   * Returns the file path. Partial context is written if some fetches fail.
   */
  async generateContextFile(taskDescription: string): Promise<string> {
    fs.mkdirSync(MITABLE_DIR, { recursive: true });

    // Fetch all context sources in parallel — failures are non-fatal
    const [searchResult, currentResult, knowledgeResult] = await Promise.allSettled([
      this.fetchWorkHistory(taskDescription),
      this.fetchCurrentActivity(),
      this.fetchKnowledge(taskDescription),
    ]);

    const workHistory = searchResult.status === "fulfilled" ? searchResult.value : null;
    const currentActivity = currentResult.status === "fulfilled" ? currentResult.value : null;
    const knowledge = knowledgeResult.status === "fulfilled" ? knowledgeResult.value : null;

    if (searchResult.status === "rejected") {
      logger.warn("Failed to fetch work history:", searchResult.reason);
    }
    if (currentResult.status === "rejected") {
      logger.warn("Failed to fetch current activity:", currentResult.reason);
    }
    if (knowledgeResult.status === "rejected") {
      logger.warn("Failed to fetch knowledge:", knowledgeResult.reason);
    }

    const markdown = this.formatMarkdown(taskDescription, currentActivity, workHistory, knowledge);
    await fs.promises.writeFile(CONTEXT_FILE, markdown, "utf-8");
    logger.info(`Context file written to ${CONTEXT_FILE}`);

    return CONTEXT_FILE;
  }

  private async fetchWorkHistory(query: string): Promise<WorkChunk[]> {
    const res = await authManager.authenticatedFetch("/api/context/search", {
      method: "POST",
      body: JSON.stringify({ query, topK: 15 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.chunks || [];
  }

  private async fetchCurrentActivity(): Promise<{ name?: string; status?: string } | null> {
    const res = await authManager.authenticatedFetch("/api/context/current");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.activeSession || null;
  }

  private async fetchKnowledge(query: string): Promise<KnowledgeResult[]> {
    const res = await authManager.authenticatedFetch("/api/context/knowledge", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  private formatMarkdown(
    taskDescription: string,
    currentActivity: { name?: string; status?: string } | null,
    workHistory: WorkChunk[] | null,
    knowledge: KnowledgeResult[] | null
  ): string {
    const lines: string[] = [];

    lines.push("# Mitable Work Context");
    lines.push(`> Auto-generated for: "${taskDescription}"`);
    lines.push(`> Generated at: ${new Date().toISOString()}`);
    lines.push("");

    // Current Activity
    lines.push("## Current Activity");
    if (currentActivity) {
      lines.push(`Currently working on: ${currentActivity.name || "Unnamed session"} (status: ${currentActivity.status || "unknown"})`);
    } else {
      lines.push("No active session.");
    }
    lines.push("");

    // Relevant Work History
    lines.push("## Relevant Work History");
    if (workHistory && workHistory.length > 0) {
      for (const chunk of workHistory) {
        const header = [
          chunk.sessionName || "Session",
          chunk.chunkType,
          chunk.similarity != null ? `similarity: ${chunk.similarity.toFixed(2)}` : null,
        ].filter(Boolean).join(" | ");
        lines.push(`### [${header}]`);
        lines.push(chunk.text);
        lines.push("");
      }
    } else {
      lines.push("No relevant work history found.");
      lines.push("");
    }

    // Knowledge Sources
    lines.push("## Knowledge Sources");
    if (knowledge && knowledge.length > 0) {
      for (const result of knowledge) {
        const header = [
          result.source,
          result.channelName ? `#${result.channelName}` : null,
          result.pageTitle ? `"${result.pageTitle}"` : null,
          result.score != null ? `score: ${result.score.toFixed(2)}` : null,
        ].filter(Boolean).join(" | ");
        lines.push(`### [${header}]`);
        lines.push(result.text);
        lines.push("");
      }
    } else {
      lines.push("No knowledge sources available.");
      lines.push("");
    }

    return lines.join("\n");
  }
}

export const contextFileService = new ContextFileService();
