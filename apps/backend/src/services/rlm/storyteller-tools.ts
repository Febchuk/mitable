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
  description: "Get metadata about the timeline (count, duration, date range)",
  parameters: [],
  execute: (_params, env: StorytellerEnvironment) => {
    return env.getStats();
  },
};

/**
 * Tool: Get Sustained Work
 * Groups activities by app/artifact and identifies sustained work (5+ captures)
 * These MUST be included in the summary regardless of position in session
 */
export const GET_SUSTAINED_WORK: RLMTool = {
  name: "get_sustained_work",
  description: "Get work clusters with 5+ captures. Sustained work MUST be included in summary.",
  parameters: [],
  execute: (_params, env: StorytellerEnvironment) => {
    const log = createSessionLogger({ sessionId: env.metadata.sessionId });

    if (env.timeline.length === 0) {
      return { sustainedWork: [], message: "No timeline data" };
    }

    // Group activities by app (simple grouping)
    const workGroups = new Map<string, any[]>();

    for (const activity of env.timeline) {
      if (
        !activity.activityDescription ||
        activity.activityDescription === "Analysis inconclusive"
      ) {
        continue;
      }

      const classifierData: any = activity.classifierData || {};
      const app = classifierData.app || classifierData.system || "Unknown";

      if (!workGroups.has(app)) {
        workGroups.set(app, []);
      }

      workGroups.get(app)!.push({
        time: activity.capturedAt.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        description: activity.activityDescription,
        actionType: classifierData.actionType,
      });
    }

    // Filter for sustained work (5+ captures)
    const sustainedWork = Array.from(workGroups.entries())
      .filter(([_app, activities]) => activities.length >= 5)
      .map(([app, activities]) => ({
        app,
        captureCount: activities.length,
        firstCapture: activities[0].time,
        lastCapture: activities[activities.length - 1].time,
        sampleActivities: activities.slice(0, 3).map((a) => a.description),
        mustInclude: true,
      }))
      .sort((a, b) => b.captureCount - a.captureCount);

    log.debug("Identified sustained work", {
      totalGroups: workGroups.size,
      sustainedCount: sustainedWork.length,
      threshold: 5,
    });

    return {
      sustainedWork,
      count: sustainedWork.length,
      message:
        sustainedWork.length > 0
          ? `Found ${sustainedWork.length} sustained work clusters (5+ captures each) - ALL must be included in summary`
          : "No sustained work clusters found (need 5+ captures per app/task)",
    };
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

    const prompt = `Summarize these activities concisely (2-4 sentences max). Focus on what was accomplished.

Activities:
${activitiesText}

Summary:`;

    // Call LLM for summarization
    const groq = new Groq({ apiKey: config.groq.apiKey });

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a concise work summarizer. Analyze the activities to identify patterns and outcomes. Summarize what the user accomplished without filtering or judging importance.",
          },
          {
            role: "user",
            content: `${prompt}\n\nAnalyze these activities and identify: (1) outcomes and completions, (2) collaboration and communication, (3) research and administrative tasks. Write a concise summary of all work performed.`,
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
      log.error("Failed to summarize chunk", {
        chunkIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};

/**
 * Tool: Polish Summary
 * Final cleanup pass - no new claims, just formatting and clarity
 */
export const POLISH_SUMMARY: RLMTool = {
  name: "polish_summary",
  description:
    "Polish the final summary for clarity and formatting. Automatically chunks large summaries. DO NOT add new information.",
  parameters: [
    {
      name: "draftSummary",
      type: "string",
      description: "The draft summary to polish",
      required: true,
    },
  ],
  execute: async (params, env: StorytellerEnvironment) => {
    const { draftSummary } = params;
    const log = createSessionLogger({ sessionId: env.metadata.sessionId });

    const styleGuidance =
      env.preferences.style === "concise"
        ? "Keep it concise and tight."
        : "Maintain detail and context.";

    const formatGuidance =
      env.preferences.format === "bullets"
        ? "Format as clean bullet points."
        : "Format as connected paragraphs.";

    const groq = new Groq({ apiKey: config.groq.apiKey });

    // Split large summaries into chunks (by paragraph or bullet point)
    const CHUNK_SIZE = 1000; // chars per chunk

    if (draftSummary.length <= CHUNK_SIZE) {
      // Small summary - polish in one call
      const prompt = `Polish this work summary for clarity and formatting. DO NOT add new information or claims.

${styleGuidance}
${formatGuidance}

Draft Summary:
${draftSummary}

Instructions:
- Fix any grammar or clarity issues
- Ensure consistent formatting
- Remove redundancy
- DO NOT invent new work items
- DO NOT add people or systems not mentioned in the draft
- Write in first person

Polished Summary:`;

      try {
        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are a copy editor. Polish the summary for clarity and formatting. DO NOT add new information. Only improve what's already there.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          model: "openai/gpt-oss-120b",
          temperature: 0.1,
          max_tokens: env.preferences.style === "verbose" ? 1500 : 800,
        });

        const polished = completion.choices[0]?.message?.content || draftSummary;

        log.debug("Polished summary (single pass)", {
          originalLength: draftSummary.length,
          polishedLength: polished.length,
        });

        return polished;
      } catch (error) {
        log.error("Failed to polish summary", {
          error: error instanceof Error ? error.message : String(error),
        });
        return draftSummary;
      }
    }

    // Large summary - split into chunks
    log.debug("Summary too large, chunking for polish", {
      length: draftSummary.length,
      chunkSize: CHUNK_SIZE,
    });

    // Split by paragraphs or bullet points
    const separator = env.preferences.format === "bullets" ? /\n[-•]\s*/g : /\n\n+/g;
    const segments = draftSummary.split(separator).filter((s: string) => s.trim().length > 0);

    // Group segments into chunks
    const chunks: string[] = [];
    let currentChunk = "";

    for (const segment of segments) {
      if ((currentChunk + segment).length > CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = segment;
      } else {
        currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + segment;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    log.debug("Split summary into chunks", { chunkCount: chunks.length });

    // Polish each chunk
    const polishedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const prompt = `Polish this section of a work summary for clarity and formatting. DO NOT add new information.

${styleGuidance}
${formatGuidance}

Section ${i + 1} of ${chunks.length}:
${chunk}

Instructions:
- Fix any grammar or clarity issues
- Ensure consistent formatting
- Remove redundancy
- DO NOT invent new work items
- DO NOT add people or systems not mentioned
- Write in first person

Polished Section:`;

      try {
        const completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are a copy editor. Polish the summary section for clarity and formatting. DO NOT add new information. Only improve what's already there.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          model: "openai/gpt-oss-120b",
          temperature: 0.1,
          max_tokens: 600,
        });

        const polished = completion.choices[0]?.message?.content || chunk;
        polishedChunks.push(polished);

        log.debug(`Polished chunk ${i + 1}/${chunks.length}`, {
          originalLength: chunk.length,
          polishedLength: polished.length,
        });
      } catch (error) {
        log.error(`Failed to polish chunk ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        polishedChunks.push(chunk); // Keep original chunk on error
      }
    }

    // Reassemble
    const finalSummary = polishedChunks.join("\n\n");

    log.debug("Reassembled polished summary", {
      originalLength: draftSummary.length,
      polishedLength: finalSummary.length,
      chunkCount: chunks.length,
    });

    return finalSummary;
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
      log.error("Failed to merge summaries", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};

/**
 * All available Storyteller tools
 */
export const STORYTELLER_TOOLS: RLMTool[] = [
  GET_TIMELINE_STATS,
  GET_SUSTAINED_WORK,
  GET_ACTIVITIES,
  CHUNK_TIMELINE,
  SUMMARIZE_CHUNK,
  MERGE_SUMMARIES,
  POLISH_SUMMARY,
];

/**
 * Get tool by name
 */
export function getToolByName(name: string): RLMTool | undefined {
  return STORYTELLER_TOOLS.find((tool) => tool.name === name);
}
