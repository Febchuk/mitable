/**
 * Storyteller RLM Tools
 *
 * Predefined, safe tools that the Storyteller RLM can use to analyze timelines.
 * Each tool is focused and type-safe - no arbitrary code execution.
 */

import Groq from "groq-sdk";
import { config } from "../../config";
import { StorytellerEnvironment } from "./storyteller-environment";
import { createSessionLogger } from "../../lib/sessionLogger";

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

    const prompt = `Summarize these activities concisely (2-4 sentences max). Focus on outcomes and meaningful work.

Activities:
${activitiesText}

Summary:`;

    // Call LLM for summarization with retry
    const groq = new Groq({ apiKey: config.groq.apiKey });
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are a concise work summarizer. Before summarizing, analyze the activities to identify patterns, outcomes, and meaningful progress. Think through what the user actually accomplished and filter out noise.",
            },
            {
              role: "user",
              content: `${prompt}\n\nFirst, analyze these activities and identify: (1) actual outcomes and completions, (2) collaboration and communication, (3) research and learning. Then write a concise summary focusing on meaningful work.`,
            },
          ],
          model: "openai/gpt-oss-120b",
          temperature: 0.2,
          max_tokens: 800,
        });

        const summary = completion.choices[0]?.message?.content || "Failed to generate summary";

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
      env.preferences.style === "concise"
        ? "Write a concise summary (3-7 main points). Focus on key highlights and outcomes."
        : "Write a detailed narrative (8-15 main points). Include context, process, and outcomes.";

    const formatGuidance =
      env.preferences.format === "bullets"
        ? "Use bullet points (• or -) for each main activity."
        : "Write in flowing, connected paragraphs with transitions.";

    const prompt = `Merge these chunk summaries into a cohesive final session update.

${styleGuidance}
${formatGuidance}

Chunk Summaries:
${summariesText}

Final Summary:`;

    const groq = new Groq({ apiKey: config.groq.apiKey });
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are an expert editor who combines summaries into cohesive narratives. Before writing, analyze the chunk summaries to identify the overall arc, key themes, and most important outcomes. Think critically about what truly matters. Write in first person.",
            },
            {
              role: "user",
              content: `${prompt}\n\nFirst, reason through: What was the main focus? What were the actual outcomes? What patterns emerge across chunks? Then write the final summary with this understanding.`,
            },
          ],
          model: "openai/gpt-oss-120b",
          temperature: 0.2,
          max_tokens: env.preferences.style === "verbose" ? 2000 : 1000,
        });

        const finalSummary = completion.choices[0]?.message?.content || "Failed to merge summaries";

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
