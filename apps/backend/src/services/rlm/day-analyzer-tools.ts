/**
 * Day Analyzer RLM Tools
 *
 * Predefined, safe tools for reconstructing a user's day into
 * named work and meeting blocks. The LLM reads session data (master stories,
 * classifier output, transcripts) and emits structured activity blocks.
 *
 * Meeting detection: Cross-references transcripts, captures (app in focus),
 * and master story narratives — does NOT blindly trust transcript timestamps.
 */

import { DayAnalyzerEnvironment, EmittedBlock } from "./day-analyzer-environment";

export interface DayAnalyzerToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required: boolean;
}

export interface DayAnalyzerTool {
  name: string;
  description: string;
  parameters: DayAnalyzerToolParameter[];
  execute: (params: any, env: DayAnalyzerEnvironment) => any;
}

/**
 * Tool: Get Day Overview
 * Returns high-level stats: session count, time range, unique apps, transcript availability.
 * ALWAYS call this first.
 */
export const GET_DAY_OVERVIEW: DayAnalyzerTool = {
  name: "get_day_overview",
  description:
    "Get high-level overview of the user's day: session count, time range, unique apps, which sessions have transcripts and master stories. CALL THIS FIRST to plan your analysis.",
  parameters: [],
  execute: (_params, env) => env.getDayOverview(),
};

/**
 * Tool: Get Session Master Story
 * Read the storyteller's narrative summary for a specific session.
 * This is the richest single source — it already identifies meetings, key activities,
 * and time boundaries within a session.
 */
export const GET_SESSION_SUMMARY: DayAnalyzerTool = {
  name: "get_session_summary",
  description:
    "Get the master story (storyteller narrative) for a specific session. This is the richest data source — it identifies what the user did, when, and includes meeting context. Use this to understand the high-level flow before diving into captures.",
  parameters: [
    {
      name: "sessionId",
      type: "string",
      description: "The session ID to get the master story for",
      required: true,
    },
  ],
  execute: (params, env) => {
    const story = env.getMasterStory(params.sessionId);
    if (!story) {
      return { available: false, message: "No master story available for this session" };
    }
    return {
      available: true,
      sessionId: story.sessionId,
      narrative: story.narrativeSummary,
      generationTimeMs: story.generationTimeMs,
    };
  },
};

/**
 * Tool: Get Session Captures
 * Paginated access to classifier-enriched captures for a session.
 * Each capture has activityDescription, actionType, events, entities, app/window info.
 */
export const GET_SESSION_CAPTURES: DayAnalyzerTool = {
  name: "get_session_captures",
  description:
    "Get paginated captures for a specific session with classifier data (activityDescription, actionType, events, entities, app, window title). Use to identify precise activity boundaries and app usage patterns. Page through all captures to see them all.",
  parameters: [
    {
      name: "sessionId",
      type: "string",
      description: "The session ID to get captures for",
      required: true,
    },
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed). Each page returns up to 30 captures.",
      required: true,
    },
  ],
  execute: (params, env) => env.getSessionCaptures(params.sessionId, params.page),
};

/**
 * Tool: Get Session Transcripts
 * Paginated access to audio transcripts for a session.
 * Includes speaker IDs, timestamps, and transcript text.
 * CRITICAL: Do NOT assume transcript start = meeting start.
 * Cross-reference with captures to determine actual meeting boundaries.
 */
export const GET_SESSION_TRANSCRIPTS: DayAnalyzerTool = {
  name: "get_session_transcripts",
  description:
    "Get paginated audio transcripts for a session with speaker IDs and timestamps. IMPORTANT: Users often have audio on all day — transcript timestamps do NOT mean a meeting started/ended at those times. Cross-reference with captures (check if Zoom/Meet/Teams was in focus) and the master story to determine actual meeting boundaries.",
  parameters: [
    {
      name: "sessionId",
      type: "string",
      description: "The session ID to get transcripts for",
      required: true,
    },
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed). Each page returns up to 20 transcript rows.",
      required: true,
    },
  ],
  execute: (params, env) => env.getSessionTranscripts(params.sessionId, params.page),
};

/**
 * Tool: Get Captures By Time Range
 * Cross-session capture lookup for a specific time window.
 * Useful for verifying what app was in focus during a transcript segment.
 */
export const GET_CAPTURES_BY_TIME: DayAnalyzerTool = {
  name: "get_captures_by_time",
  description:
    "Get all captures across sessions within a specific time window. Useful to cross-reference with transcripts — check what app was in focus when speech was detected to confirm meeting boundaries.",
  parameters: [
    {
      name: "startTime",
      type: "string",
      description: "ISO 8601 start time",
      required: true,
    },
    {
      name: "endTime",
      type: "string",
      description: "ISO 8601 end time",
      required: true,
    },
  ],
  execute: (params, env) => {
    const captures = env.getCapturesByTimeRange(
      new Date(params.startTime),
      new Date(params.endTime)
    );
    return {
      count: captures.length,
      captures: captures.map((c) => ({
        capturedAt: c.capturedAt,
        appName: c.appName,
        windowTitle: c.windowTitle,
        activityDescription: c.activityDescription,
        actionType: c.classifierData?.actionType,
      })),
    };
  },
};

/**
 * Tool: Emit Work Block
 * Output a named work activity block with time range, apps, and category.
 */
export const EMIT_WORK_BLOCK: DayAnalyzerTool = {
  name: "emit_work_block",
  description:
    "Emit a named work block. Each block represents a coherent unit of work (e.g., 'Auth PR Code Review', 'Payment Flow Implementation'). Blocks should not overlap.",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Descriptive name for the work block (e.g., 'Auth PR Code Review')",
      required: true,
    },
    {
      name: "startTime",
      type: "string",
      description: "ISO 8601 start time of the block",
      required: true,
    },
    {
      name: "endTime",
      type: "string",
      description: "ISO 8601 end time of the block",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Longer AI-generated description of what happened in this block",
      required: true,
    },
    {
      name: "apps",
      type: "array",
      description: "Array of app names used during this block (e.g., ['VS Code', 'Chrome'])",
      required: true,
    },
    {
      name: "category",
      type: "string",
      description:
        "Activity category: 'development', 'communication', 'research', 'design', 'review', 'documentation', 'other'",
      required: true,
    },
    {
      name: "sourceSessionIds",
      type: "array",
      description: "Array of session IDs that contributed to this block",
      required: true,
    },
  ],
  execute: (params, env) => {
    const block: EmittedBlock = {
      type: "work",
      name: params.name,
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
      durationMinutes: Math.round(
        (new Date(params.endTime).getTime() - new Date(params.startTime).getTime()) / 60000
      ),
      description: params.description,
      apps: params.apps || [],
      category: params.category || "other",
      sourceSessionIds: params.sourceSessionIds || [],
    };
    return env.emitBlock(block);
  },
};

/**
 * Tool: Emit Meeting Block
 * Output a named meeting block with time range, participants, and category.
 * Meeting boundaries must be determined by cross-referencing captures + transcripts + master story.
 */
export const EMIT_MEETING_BLOCK: DayAnalyzerTool = {
  name: "emit_meeting_block",
  description:
    "Emit a named meeting block. Determine meeting boundaries by cross-referencing: (1) master story mentions of meetings, (2) captures showing Zoom/Meet/Teams in focus, (3) transcript content with multiple speakers. Do NOT just use transcript start/end as meeting boundaries.",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Descriptive name for the meeting (e.g., 'Sprint Planning Standup')",
      required: true,
    },
    {
      name: "startTime",
      type: "string",
      description: "ISO 8601 start time — determined by cross-referencing captures and story",
      required: true,
    },
    {
      name: "endTime",
      type: "string",
      description: "ISO 8601 end time — determined by cross-referencing captures and story",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "What was discussed / decided in the meeting",
      required: true,
    },
    {
      name: "apps",
      type: "array",
      description: "Meeting apps used (e.g., ['Zoom', 'Google Meet'])",
      required: true,
    },
    {
      name: "category",
      type: "string",
      description:
        "Meeting category: 'standup', 'planning', 'review', 'one_on_one', 'external', 'team_sync', 'other'",
      required: true,
    },
    {
      name: "participants",
      type: "array",
      description:
        "Participants if identifiable from transcripts (e.g., ['Speaker 0', 'Speaker 1'] or named)",
      required: false,
    },
    {
      name: "sourceSessionIds",
      type: "array",
      description: "Array of session IDs that contributed to this block",
      required: true,
    },
  ],
  execute: (params, env) => {
    const block: EmittedBlock = {
      type: "meeting",
      name: params.name,
      startTime: new Date(params.startTime),
      endTime: new Date(params.endTime),
      durationMinutes: Math.round(
        (new Date(params.endTime).getTime() - new Date(params.startTime).getTime()) / 60000
      ),
      description: params.description,
      apps: params.apps || [],
      category: params.category || "other",
      participants: params.participants || [],
      sourceSessionIds: params.sourceSessionIds || [],
    };
    return env.emitBlock(block);
  },
};

/**
 * Tool: List Emitted Blocks
 * Review all blocks emitted so far. Use before finalizing to check for gaps or overlaps.
 */
export const LIST_BLOCKS: DayAnalyzerTool = {
  name: "list_blocks",
  description:
    "List all activity blocks emitted so far, sorted by time. Use to review before finalizing — check for gaps, overlaps, or missing activities.",
  parameters: [],
  execute: (_params, env) => {
    const blocks = env.getEmittedBlocks();
    return {
      totalBlocks: blocks.length,
      blocks: blocks.map((b, i) => ({
        index: i,
        type: b.type,
        name: b.name,
        startTime: b.startTime,
        endTime: b.endTime,
        durationMinutes: b.durationMinutes,
        apps: b.apps,
        category: b.category,
        participants: b.participants,
      })),
    };
  },
};

/**
 * All Day Analyzer tools
 */
export const DAY_ANALYZER_TOOLS: DayAnalyzerTool[] = [
  GET_DAY_OVERVIEW,
  GET_SESSION_SUMMARY,
  GET_SESSION_CAPTURES,
  GET_SESSION_TRANSCRIPTS,
  GET_CAPTURES_BY_TIME,
  EMIT_WORK_BLOCK,
  EMIT_MEETING_BLOCK,
  LIST_BLOCKS,
];

/**
 * Get tool by name
 */
export function getDayAnalyzerToolByName(name: string): DayAnalyzerTool | undefined {
  return DAY_ANALYZER_TOOLS.find((tool) => tool.name === name);
}
