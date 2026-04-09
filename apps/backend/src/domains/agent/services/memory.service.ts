/**
 * MemoryService - Conversation memory management
 *
 * Responsibilities:
 * - Token-aware conversation history management
 * - Incremental summarization using Groq
 * - Short-term (verbatim) + long-term (summary) memory
 * - Privacy-aware: no code/PII in summaries
 *
 * Architecture:
 * - Recent turns: Last N exchanges kept verbatim
 * - Older turns: Incrementally summarized into compact memory
 * - Tool calls: Transformed to natural language (what was learned, not raw data)
 */

import Groq from "groq-sdk";
import { encoding_for_model } from "tiktoken";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, isNull } from "drizzle-orm";
import { config } from "../../../config.js";

// Memory configuration
const MEMORY_CONFIG = {
  VERBATIM_TURNS: 3, // Keep last N exchanges verbatim (6 messages)
  SUMMARY_TRIGGER_TOKENS: 8000, // Summarize when context exceeds this (trigger early)
  SUMMARY_TRIGGER_TURNS: 8, // Or when turns exceed this (whichever comes first)
  MAX_SUMMARY_TOKENS: 10000, // Cap summary at this size (allow detailed summaries!)
  SUMMARY_BLOAT_THRESHOLD: 15000, // Re-summarize if summary exceeds this (very high threshold)
  SUMMARIZATION_MODEL: "llama-3.1-8b-instant", // Cheapest/fastest Groq model for summarization
  TEMPERATURE: 0.3, // Lower for consistency
};

interface ConversationMemory {
  conversationSummary: string | null;
  recentTurns: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
  summaryUpToTurn: number;
  estimatedTokens: number;
}

interface Message {
  role: string;
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  messageType?: string | null;
}

class MemoryService {
  private groq: Groq;
  private tokenEncoder: any;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
    this.tokenEncoder = encoding_for_model("gpt-3.5-turbo"); // Close enough for estimation
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    try {
      return this.tokenEncoder.encode(text).length;
    } catch (error) {
      // Fallback: rough estimate (1 token ≈ 4 chars)
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Format tool calls for summarization
   * Transforms raw tool outputs into natural language descriptions
   * PRIVACY: No code, no raw search results, just what was learned
   */
  private formatToolCallForSummary(toolName: string, args: any, result: string): string {
    try {
      const parsedResult = JSON.parse(result);

      switch (toolName) {
        case "search_code": {
          const resultCount = parsedResult.results?.length || 0;
          return `searched codebase for "${args.query}" (found ${resultCount} files)`;
        }

        case "view_code": {
          const file = args.filePath || args.files?.[0]?.filePath;
          const func = args.functionName || "code";
          return `viewed ${func} in ${file}`;
        }

        case "search_slack": {
          const resultCount = parsedResult.results?.length || 0;
          const topTopics = parsedResult.results
            ?.slice(0, 3)
            .map((r: any) => r.channelName)
            .join(", ");
          return `searched Slack for "${args.query}" (${resultCount} messages in ${topTopics || "various channels"})`;
        }

        case "search_notion": {
          const resultCount = parsedResult.results?.length || 0;
          const pages = parsedResult.results
            ?.slice(0, 2)
            .map((r: any) => r.pageTitle)
            .join(", ");
          return `searched Notion docs for "${args.query}" (found ${resultCount} blocks in ${pages || "various pages"})`;
        }

        case "search_work": {
          const resultCount = parsedResult.results?.length || 0;
          return `searched GitHub work items for "${args.query}" (${resultCount} PRs/commits/issues)`;
        }

        default:
          return `called ${toolName}`;
      }
    } catch {
      // If result parsing fails, just return generic description
      return `called ${toolName} with query "${args.query || args.filePath || "..."}"`;
    }
  }

  /**
   * Format conversation turns for summarization
   * Includes natural language descriptions of tool usage
   */
  private formatTurnsForSummary(turns: Message[]): string {
    const formatted: string[] = [];

    for (let i = 0; i < turns.length; i++) {
      const msg = turns[i];

      if (msg.role === "user") {
        formatted.push(`User: ${msg.content}`);
      } else if (msg.role === "assistant") {
        // Check if assistant made tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const toolDescriptions = msg.tool_calls.map((tc) => {
            const args = JSON.parse(tc.function.arguments);
            // Find corresponding tool result
            const toolResult = turns
              .slice(i + 1)
              .find((t) => t.role === "tool" && t.tool_call_id === tc.id);
            if (toolResult) {
              return this.formatToolCallForSummary(tc.function.name, args, toolResult.content);
            }
            return `called ${tc.function.name}`;
          });
          formatted.push(`Assistant: ${toolDescriptions.join(", then ")}`);
        }

        // Include final answer if present
        if (msg.content) {
          // Truncate very long responses for summary
          const truncated =
            msg.content.length > 500 ? msg.content.substring(0, 500) + "..." : msg.content;
          formatted.push(`Assistant response: ${truncated}`);
        }
      }
      // Skip tool messages (already included in assistant's tool_calls)
    }

    return formatted.join("\n\n");
  }

  /**
   * Update conversation summary incrementally
   */
  private async summarizeConversation(
    existingSummary: string | null,
    newTurns: Message[]
  ): Promise<string> {
    const formattedTurns = this.formatTurnsForSummary(newTurns);

    const prompt = existingSummary
      ? `You have an existing conversation summary:
"${existingSummary}"

The conversation continued with:
${formattedTurns}

Update the summary to include the new information. Be DETAILED (max 3000 tokens) and preserve:
- All key questions asked and their context
- What was learned from searches/tools (detailed descriptions, no raw code/data)
- Decisions made and reasoning
- Technical details, configurations, and implementation notes
- User preferences, constraints, or requirements
- Important insights or discoveries

Preserve as much information as possible while avoiding raw code or search results.
Return ONLY the updated summary, nothing else.`
      : `Summarize this conversation in DETAIL (max 3000 tokens):
${formattedTurns}

Include:
- All key questions asked and their context
- What was learned from searches/tools (detailed descriptions, no raw code/data)
- Decisions made and reasoning
- Technical details, configurations, and implementation notes
- User preferences, constraints, or requirements
- Important insights or discoveries

Preserve as much information as possible while avoiding raw code or search results

Return ONLY the summary, nothing else.`;

    const response = await this.groq.chat.completions.create({
      model: MEMORY_CONFIG.SUMMARIZATION_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MEMORY_CONFIG.MAX_SUMMARY_TOKENS,
      temperature: MEMORY_CONFIG.TEMPERATURE,
    });

    return response.choices[0]?.message?.content || existingSummary || "";
  }

  /**
   * Re-summarize entire conversation (when summary gets too long)
   */
  private async compressSummary(bloatedSummary: string): Promise<string> {
    const prompt = `The following conversation summary has become very long (>15K tokens). Compress it to around 8000 tokens while preserving as much detail as possible:

"${bloatedSummary}"

Preserve:
- All major questions and topics discussed
- Key learnings, discoveries, and decisions with reasoning
- Technical details, configurations, and implementation notes
- Important context that affects future responses
- User preferences and constraints
- Chronological flow and narrative

Only remove redundancy and excessive detail. Keep information-dense.
Return ONLY the compressed summary, nothing else.`;

    const response = await this.groq.chat.completions.create({
      model: MEMORY_CONFIG.SUMMARIZATION_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 9000, // Allow headroom
      temperature: MEMORY_CONFIG.TEMPERATURE,
    });

    return response.choices[0]?.message?.content || bloatedSummary;
  }

  /**
   * Get conversation memory (summary + recent turns)
   */
  async getConversationMemory(conversationId: string): Promise<ConversationMemory> {
    // Get conversation from DB
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get all messages
    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);

    // Filter out tool messages for verbatim turns (they're ephemeral)
    const nonToolMessages = messages.filter((m) => m.role !== "tool");

    // Determine how many recent turns to keep verbatim
    const verbatimCount = MEMORY_CONFIG.VERBATIM_TURNS * 2; // user + assistant pairs
    const recentTurns = nonToolMessages.slice(-verbatimCount).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Estimate total tokens
    const summaryTokens = conversation.conversationSummary
      ? this.countTokens(conversation.conversationSummary)
      : 0;
    const recentTokens = recentTurns.reduce((sum, t) => sum + this.countTokens(t.content), 0);

    return {
      conversationSummary: conversation.conversationSummary || null,
      recentTurns,
      summaryUpToTurn: conversation.summaryUpToTurn || 0,
      estimatedTokens: summaryTokens + recentTokens,
    };
  }

  /**
   * Update conversation memory after new turns
   */
  async updateConversationMemory(conversationId: string): Promise<void> {
    // Get current conversation state
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get all messages to check if summarization needed
    const allMessages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);

    const totalTurns = allMessages.filter((m) => m.role !== "tool").length;
    const totalTokens = allMessages.reduce((sum, m) => sum + this.countTokens(m.content), 0);

    // Check if summarization is needed (token budget OR turn count)
    const needsSummarization =
      totalTokens > MEMORY_CONFIG.SUMMARY_TRIGGER_TOKENS ||
      totalTurns > MEMORY_CONFIG.SUMMARY_TRIGGER_TURNS;

    if (!needsSummarization) {
      console.log(
        `[MemoryService] No summarization needed (${totalTurns} turns, ~${totalTokens} tokens)`
      );
      return;
    }

    console.log(
      `[MemoryService] Summarization triggered (${totalTurns} turns, ~${totalTokens} tokens)`
    );

    // Get unsummarized turns (everything except recent verbatim window)
    const summaryUpToTurn = conversation.summaryUpToTurn || 0;
    const verbatimCount = MEMORY_CONFIG.VERBATIM_TURNS * 2;
    const unsummarizedTurns = allMessages.slice(summaryUpToTurn, -verbatimCount);

    if (unsummarizedTurns.length === 0) {
      console.log(`[MemoryService] No new turns to summarize`);
      return;
    }

    // Check if existing summary is bloated
    let currentSummary = conversation.conversationSummary || null;
    if (
      currentSummary &&
      this.countTokens(currentSummary) > MEMORY_CONFIG.SUMMARY_BLOAT_THRESHOLD
    ) {
      console.log(`[MemoryService] Summary bloated, compressing...`);
      currentSummary = await this.compressSummary(currentSummary);
    }

    // Summarize unsummarized turns
    const updatedSummary = await this.summarizeConversation(currentSummary, unsummarizedTurns);

    // Update DB
    await db
      .update(schema.conversations)
      .set({
        conversationSummary: updatedSummary,
        summaryUpToTurn: allMessages.length - verbatimCount,
        updatedAt: new Date(),
      })
      .where(eq(schema.conversations.id, conversationId));

    console.log(
      `[MemoryService] Summary updated (${this.countTokens(updatedSummary)} tokens, up to turn ${allMessages.length - verbatimCount})`
    );
  }

  /**
   * Backfill summaries for existing conversations without summaries
   * Use this to pre-summarize long conversations after deploying the memory system
   */
  async backfillSummaries(options?: {
    minMessages?: number; // Only summarize conversations with at least this many messages
    batchSize?: number; // Process this many conversations at a time
    dryRun?: boolean; // If true, only logs what would be done without actually summarizing
  }): Promise<{
    processed: number;
    summarized: number;
    skipped: number;
    errors: string[];
  }> {
    const minMessages = options?.minMessages || MEMORY_CONFIG.SUMMARY_TRIGGER_TURNS;
    const batchSize = options?.batchSize || 10;
    const dryRun = options?.dryRun || false;

    console.log(`[MemoryService] Starting backfill...`);
    console.log(
      `[MemoryService] Config: minMessages=${minMessages}, batchSize=${batchSize}, dryRun=${dryRun}`
    );

    const result = {
      processed: 0,
      summarized: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      // Find conversations without summaries
      const conversationsToProcess = await db
        .select()
        .from(schema.conversations)
        .where(isNull(schema.conversations.conversationSummary))
        .limit(batchSize);

      console.log(`[MemoryService] Found ${conversationsToProcess.length} conversations to check`);

      for (const conversation of conversationsToProcess) {
        result.processed++;

        try {
          // Check message count
          const messages = await db
            .select()
            .from(schema.messages)
            .where(eq(schema.messages.conversationId, conversation.id))
            .orderBy(schema.messages.createdAt);

          const messageCount = messages.filter((m) => m.role !== "tool").length;

          if (messageCount < minMessages) {
            console.log(
              `[MemoryService] Skipping conversation ${conversation.id} (${messageCount} messages < ${minMessages})`
            );
            result.skipped++;
            continue;
          }

          console.log(
            `[MemoryService] Processing conversation ${conversation.id} (${messageCount} messages)`
          );

          if (dryRun) {
            console.log(
              `[MemoryService] [DRY RUN] Would summarize conversation ${conversation.id}`
            );
            result.summarized++;
            continue;
          }

          // Actually update the conversation memory
          await this.updateConversationMemory(conversation.id);
          result.summarized++;

          console.log(`[MemoryService] ✅ Summarized conversation ${conversation.id}`);
        } catch (error) {
          const errorMsg = `Failed to process conversation ${conversation.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          console.error(`[MemoryService] ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }

      console.log(`[MemoryService] Backfill complete:`, result);
      return result;
    } catch (error) {
      console.error(`[MemoryService] Backfill failed:`, error);
      throw error;
    }
  }
}

export const memoryService = new MemoryService();
