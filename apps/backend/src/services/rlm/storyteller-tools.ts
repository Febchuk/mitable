/**
 * Storyteller RLM Tools
 *
 * Predefined, safe tools that the Storyteller RLM can use to analyze timelines.
 * Each tool is focused and type-safe - no arbitrary code execution.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../config";
import { StorytellerEnvironment } from "./storyteller-environment";
import { createSessionLogger } from "../../domains/shared-infra/lib/sessionLogger.js";
// Shared Anthropic client for tool sub-calls (Claude Sonnet 4.5 with thinking)
let anthropicClient: Anthropic | null = null;
if (config.anthropic.apiKey) {
  anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
}

// OpenAI GPT-5 fallback client
let openaiClient: OpenAI | null = null;
if (config.openai.apiKey) {
  openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
}

// DeepSeek V3.2 (deepseek-chat) last resort client
let deepseekClient: OpenAI | null = null;
if (config.deepseek.apiKey) {
  deepseekClient = new OpenAI({
    apiKey: config.deepseek.apiKey,
    baseURL: "https://api.deepseek.com",
  });
}

/**
 * Call Claude Sonnet 4.5 with extended thinking for high-quality summarization.
 * Falls back to OpenAI GPT-5 if Anthropic fails.
 */
async function callSummarizationLLM(
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number
): Promise<string> {
  if (anthropicClient) {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await anthropicClient.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: maxOutputTokens + 5000, // Extra headroom for thinking tokens
          thinking: {
            type: "enabled",
            budget_tokens: 3000, // Let Claude reason before summarizing
          },
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        for (const block of response.content) {
          if (block.type === "text") {
            return block.text;
          }
        }
        throw new Error("No text block in Claude response");
      } catch (error) {
        const errStr = String(error);
        const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
        if (isFatal) {
          console.error(
            "[storyteller-tools] Claude auth/billing error — permanently disabling:",
            errStr
          );
          anthropicClient = null;
          break;
        }
        const isRetryable = /429|rate.?limit|529|overloaded/i.test(errStr);
        if (isRetryable && attempt < MAX_RETRIES) {
          const delayMs = (attempt + 1) * 5000;
          console.warn(
            `[storyteller-tools] Claude rate-limited/overloaded — retrying in ${delayMs / 1000}s (attempt ${attempt + 1})`,
            errStr
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        console.warn(
          "[storyteller-tools] Claude sub-call failed — falling back to GPT-5 for this call:",
          errStr
        );
        break;
      }
    }
  }

  // OpenAI GPT-5 fallback
  if (openaiClient) {
    try {
      const completion = await openaiClient.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "gpt-5",
        max_completion_tokens: maxOutputTokens,
      });
      return completion.choices[0]?.message?.content || "Failed to generate summary";
    } catch (error) {
      console.warn("[storyteller-tools] OpenAI also failed — trying DeepSeek V3.2:", String(error));
    }
  }

  // DeepSeek V3.2 (deepseek-chat) last resort
  if (deepseekClient) {
    const completion = await deepseekClient.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "deepseek-chat",
      max_tokens: maxOutputTokens,
    });
    return completion.choices[0]?.message?.content || "Failed to generate summary";
  }

  throw new Error(
    "No LLM available for summarization — all providers (Anthropic, OpenAI, DeepSeek) are missing"
  );
}

export interface RLMToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required: boolean;
}

export interface RLMTool {
  name: string;
  description: string;
  parameters: RLMToolParameter[];
  execute: (params: any, env: StorytellerEnvironment) => Promise<any> | any;
}

/**
 * Tool: Get Timeline Statistics
 * Returns metadata about the timeline (count, duration, date range)
 */
export const GET_TIMELINE_STATS: RLMTool = {
  name: "get_timeline_stats",
  description: "Get metadata about the activity timeline (count, duration, date range)",
  parameters: [],
  execute: (_params, env: StorytellerEnvironment) => {
    return env.getStats();
  },
};

/**
 * Tool: Get Activities Slice
 * Retrieve a specific range of activities from the timeline
 */
export const GET_ACTIVITIES: RLMTool = {
  name: "get_activities",
  description: "Get a slice of activities from start index to end index",
  parameters: [
    { name: "start", type: "number", description: "Start index (inclusive)", required: true },
    { name: "end", type: "number", description: "End index (exclusive)", required: true },
  ],
  execute: (params, env: StorytellerEnvironment) => {
    const { start, end } = params;
    return env.getSlice(start, end);
  },
};

/**
 * Tool: Chunk Timeline
 * Split the timeline into chunks of specified size
 */
export const CHUNK_TIMELINE: RLMTool = {
  name: "chunk_timeline",
  description: "Split the activity timeline into chunks of specified size",
  parameters: [
    {
      name: "chunkSize",
      type: "number",
      description: "Number of activities per chunk",
      required: true,
    },
  ],
  execute: (params, env: StorytellerEnvironment) => {
    const { chunkSize } = params;
    const chunks: { index: number; start: number; end: number; count: number }[] = [];

    for (let i = 0; i < env.timeline.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, env.timeline.length);
      chunks.push({
        index: chunks.length,
        start: i,
        end: end,
        count: end - i,
      });
    }

    return {
      totalChunks: chunks.length,
      chunks,
    };
  },
};

/**
 * Tool: Filter by Priority
 * Filter activities based on priority level (1=outcomes, 2=collaboration, 3=research)
 */
export const FILTER_BY_PRIORITY: RLMTool = {
  name: "filter_by_priority",
  description:
    "Filter activities by priority level. 1=outcomes (Fixed, Merged, Completed), 2=collaboration (Reviewed, Discussed), 3=research (Researched, Searched)",
  parameters: [
    {
      name: "minPriority",
      type: "number",
      description: "Minimum priority level (1-3)",
      required: true,
    },
  ],
  execute: (params, env: StorytellerEnvironment) => {
    const { minPriority } = params;

    const priority1Keywords = [
      "merged",
      "deployed",
      "fixed",
      "completed",
      "shipped",
      "resolved",
      "finished",
    ];
    const priority2Keywords = ["reviewed", "discussed", "collaborated", "met with", "presented"];
    const priority3Keywords = ["researched", "looked up", "searched for", "read documentation"];

    const filtered = env.timeline.filter((activity) => {
      const desc = activity.activityDescription.toLowerCase();

      if (minPriority <= 1 && priority1Keywords.some((kw) => desc.includes(kw))) return true;
      if (minPriority <= 2 && priority2Keywords.some((kw) => desc.includes(kw))) return true;
      if (minPriority <= 3 && priority3Keywords.some((kw) => desc.includes(kw))) return true;

      return false;
    });

    return {
      originalCount: env.timeline.length,
      filteredCount: filtered.length,
      activities: filtered,
    };
  },
};

/**
 * Tool: Summarize Chunk
 * Recursively summarize a specific chunk of activities using LLM
 */
export const SUMMARIZE_CHUNK: RLMTool = {
  name: "summarize_chunk",
  description: "Summarize a specific chunk of activities using LLM (recursive operation)",
  parameters: [
    {
      name: "chunkIndex",
      type: "number",
      description: "Index of the chunk to summarize",
      required: true,
    },
    {
      name: "start",
      type: "number",
      description: "Start index of activities in the chunk",
      required: true,
    },
    {
      name: "end",
      type: "number",
      description: "End index of activities in the chunk",
      required: true,
    },
  ],
  execute: async (params, env: StorytellerEnvironment) => {
    const { chunkIndex, start, end } = params;
    const log = createSessionLogger({ sessionId: env.metadata.sessionId });

    // Check cache first
    const cacheKey = `chunk_summary_${chunkIndex}`;
    if (env.hasCache(cacheKey)) {
      log.debug("Using cached chunk summary", { chunkIndex });
      return env.getCache(cacheKey);
    }

    // Get activities for this chunk
    const activities = env.getSlice(start, end);

    if (activities.length === 0) {
      return { summary: "No activities in this chunk", cached: false };
    }

    // Build prompt for chunk summarization
    const activitiesText = activities
      .map((a, i) => {
        const timeStr = new Date(a.capturedAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        return `${i + 1}. [${timeStr}] ${a.activityDescription}`;
      })
      .join("\n");

    // Include audio transcripts if available
    const transcriptSection = env.fullTranscriptText
      ? `\n\nAudio Transcripts:\n${env.fullTranscriptText}\n\nUse the audio transcripts to enrich the summary with verbal context (why, intent, decisions mentioned).`
      : "";

    // Scale summary guidance with chunk size to avoid massive information loss
    const sentenceGuidance =
      activities.length <= 20
        ? "2-4 sentences"
        : activities.length <= 50
          ? "4-6 sentences"
          : activities.length <= 100
            ? "6-10 sentences"
            : "8-12 sentences";

    const prompt = `Summarize these activities (${sentenceGuidance}). Focus on outcomes and meaningful work. Cover ALL distinct tasks/apps — do not collapse different activities into one.

Activities:
${activitiesText}${transcriptSection}

Summary:`;

    // Call LLM for summarization with retry
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const attributionRule = `ATTRIBUTION: Activities starting with "Observed [Name]..." mean someone ELSE performed that action (e.g. on a shared screen or meeting). Preserve that attribution — write "Mark debugged X" NOT "I debugged X". For the user's own actions, write in first person ("I").`;

        const systemPrompt = env.fullTranscriptText
          ? `You are a concise work summarizer with access to both visual activity logs and audio transcripts. Use the audio transcripts to understand the WHY behind actions. ${attributionRule} CRITICAL: Your summary MUST ONLY mention apps, websites, and actions that appear in the provided activity list. NEVER invent or substitute different apps, people, or tasks. If activities show casual browsing, say so — do NOT fabricate professional work.`
          : `You are a concise work summarizer. ${attributionRule} CRITICAL: Your summary MUST ONLY mention apps, websites, and actions that appear in the provided activity list. NEVER invent or substitute different apps, people, or tasks. If activities show casual browsing, say so — do NOT fabricate professional work.`;

        const userPrompt = `${prompt}\n\nIMPORTANT: Only reference the specific apps, websites, and actions listed above. Do NOT add information not present in the activities. Write the user's own actions in first person. For activities starting with "Observed [Name]...", attribute them to that person (e.g. "Mark configured X"), NOT to "I".`;

        // Scale output tokens with chunk size
        const maxOutputTokens =
          activities.length <= 20 ? 800 : activities.length <= 50 ? 1200 : 1600;
        const summary = await callSummarizationLLM(systemPrompt, userPrompt, maxOutputTokens);

        // Cache the result
        env.setCache(cacheKey, { summary, cached: false });

        log.debug("Generated chunk summary", {
          chunkIndex,
          activityCount: activities.length,
          summaryLength: summary.length,
        });

        return { summary, cached: false };
      } catch (error) {
        log.warn("Chunk summarization attempt failed", {
          chunkIndex,
          attempt,
          maxRetries: MAX_RETRIES,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt)); // Exponential backoff
        } else {
          log.error("All retries exhausted for chunk summarization", { chunkIndex });
          // Return a fallback summary from raw activities instead of throwing
          const fallback = activities.map((a) => a.activityDescription).join("; ");
          return { summary: fallback, cached: false, fallback: true };
        }
      }
    }
  },
};

/**
 * Tool: Merge Summaries
 * Combine multiple chunk summaries into a final narrative
 */
export const MERGE_SUMMARIES: RLMTool = {
  name: "merge_summaries",
  description: "Merge multiple chunk summaries into a cohesive final narrative",
  parameters: [
    {
      name: "summaries",
      type: "array",
      description: "Array of chunk summaries to merge",
      required: true,
    },
  ],
  execute: async (params, env: StorytellerEnvironment) => {
    const { summaries } = params;
    const log = createSessionLogger({ sessionId: env.metadata.sessionId });

    if (!Array.isArray(summaries) || summaries.length === 0) {
      return "No summaries to merge";
    }

    if (summaries.length === 1) {
      return summaries[0];
    }

    // Build merge prompt
    const summariesText = summaries.map((s, i) => `Chunk ${i + 1}: ${s}`).join("\n\n");

    const styleGuidance =
      "Write a concise summary (3-7 main points). Focus on key highlights and outcomes.";

    const formatGuidance = "Use bullet points (• or -) for each main activity.";

    const prompt = `Merge these chunk summaries into a cohesive final session update.

${styleGuidance}
${formatGuidance}

Chunk Summaries:
${summariesText}

Final Summary:`;

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const mergeAttributionRule = `ATTRIBUTION: If chunk summaries mention someone else performing actions (e.g. "Mark debugged X"), preserve that attribution in the final narrative. Only the user's own actions should be in first person ("I"). Collaborative sessions should naturally weave both perspectives.`;

        const mergeSystemPrompt = env.fullTranscriptText
          ? `You are an expert editor who combines summaries into cohesive narratives. Preserve verbal context (intent, reasoning, decisions) in the final narrative. ${mergeAttributionRule} CRITICAL: Only mention apps, websites, people, and actions that appear in the chunk summaries below. NEVER invent details.`
          : `You are an expert editor who combines summaries into cohesive narratives. ${mergeAttributionRule} CRITICAL: Only mention apps, websites, people, and actions that appear in the chunk summaries below. NEVER invent details.`;

        const userPrompt = `${prompt}\n\nIMPORTANT: Only reference apps, websites, and actions mentioned in the chunk summaries above. Do NOT add information not present. Write the user's own actions in first person. Preserve attribution for other people's actions (e.g. "Mark resolved X").`;

        const maxTokens = 1000;
        const finalSummary = await callSummarizationLLM(mergeSystemPrompt, userPrompt, maxTokens);

        log.debug("Merged summaries", {
          chunkCount: summaries.length,
          finalLength: finalSummary.length,
        });

        return finalSummary;
      } catch (error) {
        log.warn("Merge summaries attempt failed", {
          attempt,
          maxRetries: MAX_RETRIES,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        } else {
          log.error("All retries exhausted for merge summaries");
          // Fallback: concatenate chunk summaries directly
          return summaries.join("\n\n");
        }
      }
    }
  },
};

/**
 * All available Storyteller tools
 */
export const STORYTELLER_TOOLS: RLMTool[] = [
  GET_TIMELINE_STATS,
  GET_ACTIVITIES,
  CHUNK_TIMELINE,
  FILTER_BY_PRIORITY,
  SUMMARIZE_CHUNK,
  MERGE_SUMMARIES,
];

/**
 * Get tool by name
 */
export function getToolByName(name: string): RLMTool | undefined {
  return STORYTELLER_TOOLS.find((tool) => tool.name === name);
}
