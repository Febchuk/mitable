/**
 * Block Analyzer RLM Tools
 *
 * Predefined, safe tools for classifying a single session's activities
 * into named work and meeting blocks. The LLM reads the master story,
 * captures, and transcripts, then emits structured activity blocks
 * with topic, subscriber, and category attribution.
 */

import { BlockAnalyzerEnvironment, EmittedBlock } from "./block-analyzer-environment";

export interface BlockAnalyzerToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required: boolean;
}

export interface BlockAnalyzerTool {
  name: string;
  description: string;
  parameters: BlockAnalyzerToolParameter[];
  execute: (params: any, env: BlockAnalyzerEnvironment) => any;
}

/**
 * Tool: Get Session Overview
 * Returns high-level stats: duration, apps, capture count, transcript availability.
 * ALWAYS call this first.
 */
export const GET_SESSION_OVERVIEW: BlockAnalyzerTool = {
  name: "get_session_overview",
  description:
    "Get high-level overview of the session: duration, apps used (with estimated time distribution), capture count, transcript availability, master story availability, session goal. CALL THIS FIRST to plan your analysis.",
  parameters: [],
  execute: (_params, env) => env.getSessionOverview(),
};

/**
 * Tool: Get Master Story
 * Read the storyteller's narrative summary for this session.
 * This is the richest single source.
 */
export const GET_MASTER_STORY: BlockAnalyzerTool = {
  name: "get_master_story",
  description:
    "Get the master story (storyteller narrative) for this session. This is the richest data source — it identifies what the user did, when, and includes meeting context. Use this to understand the high-level flow before diving into captures.",
  parameters: [],
  execute: (_params, env) => {
    const story = env.getMasterStory();
    if (!story) {
      return { available: false, message: "No master story available for this session" };
    }
    return {
      available: true,
      narrative: story.narrativeSummary,
      generationTimeMs: story.generationTimeMs,
    };
  },
};

/**
 * Tool: Get Captures
 * Paginated access to classifier-enriched captures.
 */
export const GET_CAPTURES: BlockAnalyzerTool = {
  name: "get_captures",
  description:
    "Get paginated captures with classifier data (activityDescription, actionType, events, entities, app, window title). Use to identify precise activity boundaries and app usage patterns. Page through all captures to see them all.",
  parameters: [
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed). Each page returns up to 30 captures.",
      required: true,
    },
  ],
  execute: (params, env) => env.getCaptures(params.page),
};

/**
 * Tool: Get Transcripts
 * Paginated access to audio transcripts.
 */
export const GET_TRANSCRIPTS: BlockAnalyzerTool = {
  name: "get_transcripts",
  description:
    "Get paginated audio transcripts with speaker IDs and timestamps. IMPORTANT: Users often have audio recording on all day — transcript timestamps do NOT mean a meeting started/ended at those times. Cross-reference with captures (check if Zoom/Meet/Teams was in focus) and the master story to determine actual meeting boundaries.",
  parameters: [
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed). Each page returns up to 20 transcript rows.",
      required: true,
    },
  ],
  execute: (params, env) => env.getTranscripts(params.page),
};

/**
 * Tool: Get Captures By Time Range
 * Lookup captures within a specific time window.
 */
export const GET_CAPTURES_BY_TIME: BlockAnalyzerTool = {
  name: "get_captures_by_time",
  description:
    "Get all captures within a specific time window. Useful to cross-reference with transcripts — check what app was in focus when speech was detected to confirm meeting boundaries.",
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
export const EMIT_WORK_BLOCK: BlockAnalyzerTool = {
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
        "Activity category: 'development', 'communication', 'research', 'design', 'review', 'documentation', 'project_management', 'other'",
      required: true,
    },
    {
      name: "topic",
      type: "string",
      description:
        "Higher-level topic/theme (3-5 words). E.g., 'Debugging API Issues', 'Sprint Planning', 'Code Review'. Use consistent names across related blocks.",
      required: false,
    },
    {
      name: "subscriber",
      type: "string",
      description:
        "External client/customer this work serves. Use contextual clues: systems used (ServiceNow, iPDF, eB), people mentioned, ticket IDs, Slack channels, project names. If work involves a client's systems, people, or issues, attribute it. Only omit for genuinely internal work (timesheets, internal dev, personal learning).",
      required: false,
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
      sourceSessionIds: [env.session.sessionId],
      topicName: params.topic || undefined,
      subscriberName: params.subscriber || undefined,
    };
    return env.emitBlock(block);
  },
};

/**
 * Tool: Emit Meeting Block
 * Output a named meeting block with time range, participants, and category.
 */
export const EMIT_MEETING_BLOCK: BlockAnalyzerTool = {
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
      name: "topic",
      type: "string",
      description:
        "Higher-level topic/theme (3-5 words). E.g., 'Sprint Planning', 'Client Sync', 'Design Review'. Use consistent names across related blocks.",
      required: false,
    },
    {
      name: "subscriber",
      type: "string",
      description:
        "External client/customer this meeting relates to. Consider: who are the participants, what's being discussed, which client's systems or issues are involved. Only omit for purely internal meetings with no client context.",
      required: false,
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
      sourceSessionIds: [env.session.sessionId],
      topicName: params.topic || undefined,
      subscriberName: params.subscriber || undefined,
    };
    return env.emitBlock(block);
  },
};

/**
 * Tool: List Emitted Blocks
 * Review all blocks emitted so far.
 */
export const LIST_BLOCKS: BlockAnalyzerTool = {
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
        topic: b.topicName,
        subscriber: b.subscriberName,
        participants: b.participants,
      })),
    };
  },
};

/**
 * All Block Analyzer tools
 */
export const BLOCK_ANALYZER_TOOLS: BlockAnalyzerTool[] = [
  GET_SESSION_OVERVIEW,
  GET_MASTER_STORY,
  GET_CAPTURES,
  GET_TRANSCRIPTS,
  GET_CAPTURES_BY_TIME,
  EMIT_WORK_BLOCK,
  EMIT_MEETING_BLOCK,
  LIST_BLOCKS,
];

/**
 * Get tool by name
 */
export function getBlockAnalyzerToolByName(name: string): BlockAnalyzerTool | undefined {
  return BLOCK_ANALYZER_TOOLS.find((tool) => tool.name === name);
}
