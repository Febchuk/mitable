/**
 * Storyteller RLM Tools
 *
 * Tools for the session storyteller: peek at classifications and transcriptions,
 * summarize chunks via sub-LLM calls, and build the final narrative.
 */

import { createLogger } from "../../../lib/logger";
import type { RLMTool } from "./local-rlm-engine";
import type { StorytellerEnvironment } from "./storyteller-rlm-environment";

const logger = createLogger("StorytellerTools");

const GET_SESSION_STATS: RLMTool<StorytellerEnvironment> = {
  name: "get_session_stats",
  description: "Returns classification count, transcription count, total minutes, and time range.",
  parameters: [],
  execute: (_params, env) => {
    const cls = env.classifications;
    const trans = env.transcriptions;

    let timeRangeStr = "unknown";
    if (cls.length > 0) {
      const firstCreated = cls[0].createdAt;
      const lastCreated = cls[cls.length - 1].createdAt;
      const durationMin = Math.round((lastCreated - firstCreated) / 60_000);
      timeRangeStr = `~${durationMin} minutes`;
    }

    const userTransCount = trans.filter((t) => ((t as any).source ?? "user") === "user").length;
    const remoteTransCount = trans.filter((t) => (t as any).source === "remote").length;

    return {
      classificationCount: cls.length,
      transcriptionCount: trans.length,
      userTranscriptionCount: userTransCount,
      remoteTranscriptionCount: remoteTransCount,
      totalMinutes: env.totalMinutes,
      duration: timeRangeStr,
      hasTranscriptions: trans.length > 0,
    };
  },
};

const GET_CLASSIFICATIONS: RLMTool<StorytellerEnvironment> = {
  name: "get_classifications",
  description:
    "Returns a slice of classification descriptions by index. Use to peek at activity blocks.",
  parameters: [
    { name: "start", type: "number", required: true, description: "Start index (0-based)" },
    { name: "end", type: "number", required: true, description: "End index (exclusive)" },
  ],
  execute: (params, env) => {
    const start = Math.max(0, Number(params.start) || 0);
    const end = Math.min(
      env.classifications.length,
      Number(params.end) || env.classifications.length
    );
    return env.classifications.slice(start, end).map((c) => ({
      batchIndex: c.batchIndex,
      activityType: c.activityType,
      description: c.activityDescription,
      onTask: c.onTask,
      importance: c.importanceScore,
    }));
  },
};

const GET_TRANSCRIPTIONS: RLMTool<StorytellerEnvironment> = {
  name: "get_transcriptions",
  description: "Returns audio transcripts for a time window (by millisecond range).",
  parameters: [
    { name: "startMs", type: "number", required: true, description: "Start time in ms" },
    { name: "endMs", type: "number", required: true, description: "End time in ms" },
  ],
  execute: (params, env) => {
    const startMs = Number(params.startMs) || 0;
    const endMs = Number(params.endMs) || Infinity;
    const matching = env.transcriptions.filter(
      (t) =>
        Number.isFinite(t.startTimeMs) &&
        Number.isFinite(t.endTimeMs) &&
        t.startTimeMs >= startMs &&
        t.endTimeMs <= endMs
    );
    return matching.map((t) => ({
      source: (t as any).source ?? "user",
      speaker: (t as any).source === "remote" ? "Remote participant" : "User",
      transcript: t.transcript,
      startMs: t.startTimeMs,
      endMs: t.endTimeMs,
    }));
  },
};

const SUMMARIZE_CHUNK: RLMTool<StorytellerEnvironment> = {
  name: "summarize_chunk",
  description:
    "Sub-LLM call: summarize a slice of classifications (+ overlapping transcriptions). Result is cached.",
  parameters: [
    { name: "start", type: "number", required: true, description: "Start classification index" },
    {
      name: "end",
      type: "number",
      required: true,
      description: "End classification index (exclusive)",
    },
  ],
  execute: async (params, env) => {
    const start = Math.max(0, Number(params.start) || 0);
    const end = Math.min(
      env.classifications.length,
      Number(params.end) || env.classifications.length
    );

    const cacheKey = `chunk_${start}_${end}`;
    const cached = env.getChunkSummary(cacheKey);
    if (cached) return { summary: cached, fromCache: true };

    const chunk = env.classifications.slice(start, end);
    if (chunk.length === 0) return { summary: "No activity in this range.", fromCache: false };

    const chunkText = chunk
      .map((c) => `[Batch ${c.batchIndex}, ${c.activityType}] ${c.activityDescription}`)
      .join("\n");

    // Find overlapping transcriptions, grouped by speaker source
    const firstCreated = chunk[0].createdAt;
    const lastCreated = chunk[chunk.length - 1].createdAt;
    const overlapping = env.transcriptions.filter(
      (t) =>
        Number.isFinite(t.startTimeMs) &&
        Number.isFinite(t.endTimeMs) &&
        t.startTimeMs >= firstCreated - 60_000 &&
        t.endTimeMs <= lastCreated + 60_000
    );

    let transcriptText = "";
    if (overlapping.length > 0) {
      const userLines = overlapping
        .filter((t) => ((t as any).source ?? "user") === "user")
        .map((t) => t.transcript);
      const remoteLines = overlapping
        .filter((t) => (t as any).source === "remote")
        .map((t) => t.transcript);

      const parts: string[] = [];
      if (userLines.length > 0) parts.push(`User said:\n${userLines.join("\n")}`);
      if (remoteLines.length > 0) parts.push(`Remote participant said:\n${remoteLines.join("\n")}`);
      transcriptText = `\n\nAudio context:\n${parts.join("\n\n")}`;
    }

    try {
      const summary = await env.completionFn(
        [
          {
            role: "system",
            content:
              "Summarize the following activity block in 2-3 sentences. Write in third person past tense. Be specific about what was done.",
          },
          {
            role: "user",
            content: `Activity:\n${chunkText}${transcriptText}`,
          },
        ],
        { temperature: 0.2, max_tokens: 256 }
      );

      env.cacheChunkSummary(cacheKey, summary);
      return { summary, fromCache: false };
    } catch (err) {
      logger.error("summarize_chunk sub-LLM call failed:", String(err));
      const fallback = chunk.map((c) => c.activityDescription).join(". ");
      env.cacheChunkSummary(cacheKey, fallback);
      return { summary: fallback, fromCache: false, error: String(err) };
    }
  },
};

const BUILD_STORY: RLMTool<StorytellerEnvironment> = {
  name: "build_story",
  description:
    "Final merge: produce narrative + tasks with time. Each task needs a description and minutes. Minutes must sum to totalMinutes from get_session_stats. Call this last.",
  parameters: [
    { name: "narrative", type: "string", required: true, description: "Full session narrative" },
    {
      name: "tasks",
      type: "array",
      required: true,
      description: "Array of {description, minutes} objects. Minutes must sum to totalMinutes.",
    },
  ],
  execute: (params, env) => {
    const narrative = String(params.narrative || "Session completed.");
    const rawTasks = Array.isArray(params.tasks) ? params.tasks : [];
    const tasks = rawTasks.map((t: any) => ({
      description: String(t.description || t),
      minutes: Math.max(1, Number(t.minutes) || 1),
    }));

    // Normalize minutes to sum to totalMinutes
    const rawSum = tasks.reduce((s, t) => s + t.minutes, 0);
    if (rawSum > 0 && rawSum !== env.totalMinutes) {
      const scale = env.totalMinutes / rawSum;
      let remaining = env.totalMinutes;
      for (let i = 0; i < tasks.length; i++) {
        if (i === tasks.length - 1) {
          tasks[i].minutes = Math.max(1, remaining);
        } else {
          tasks[i].minutes = Math.max(1, Math.round(tasks[i].minutes * scale));
          remaining -= tasks[i].minutes;
        }
      }
    }

    env.setFinalStory({ narrative, tasks });
    return { stored: true, narrative: narrative.slice(0, 100) + "...", taskCount: tasks.length };
  },
};

export const STORYTELLER_TOOLS: RLMTool<StorytellerEnvironment>[] = [
  GET_SESSION_STATS,
  GET_CLASSIFICATIONS,
  GET_TRANSCRIPTIONS,
  SUMMARIZE_CHUNK,
  BUILD_STORY,
];
