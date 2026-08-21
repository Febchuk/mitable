/**
 * Block Analyzer RLM Tools (On-Device)
 *
 * Tools for the block analyzer to read session data and emit
 * structured activity blocks with client/topic attribution.
 */

import type { RLMTool } from "./local-rlm-engine";
import { BlockAnalyzerEnvironment, type EmittedBlock } from "./block-analyzer-rlm-environment";

export const GET_SESSION_OVERVIEW: RLMTool<BlockAnalyzerEnvironment> = {
  name: "get_session_overview",
  description:
    "Get high-level session overview: duration, apps used (with time distribution), capture/classification counts, transcript and story availability. CALL THIS FIRST.",
  parameters: [],
  execute: (_params, env) => env.getSessionOverview(),
};

export const GET_STORY: RLMTool<BlockAnalyzerEnvironment> = {
  name: "get_story",
  description:
    "Get the storyteller narrative summary. This is the richest single source — identifies what the user did, when, and includes meeting context.",
  parameters: [],
  execute: (_params, env) => env.getStory(),
};

export const GET_BLOCK_CONTENT: RLMTool<BlockAnalyzerEnvironment> = {
  name: "get_block_content",
  description:
    "Get paginated block.md content — the raw session log with per-batch frame descriptions, narratives, and transcripts. Use for details the story may not cover.",
  parameters: [
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed)",
      required: true,
    },
  ],
  execute: (params, env) => env.getBlockContent(params.page as number),
};

export const GET_CAPTURES: RLMTool<BlockAnalyzerEnvironment> = {
  name: "get_captures",
  description:
    "Get paginated captures with app names, window titles, and timestamps. Use to verify precise time boundaries and app usage.",
  parameters: [
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed). Each page returns up to 30 captures.",
      required: true,
    },
  ],
  execute: (params, env) => env.getCaptures(params.page as number),
};

export const GET_CLASSIFICATIONS: RLMTool<BlockAnalyzerEnvironment> = {
  name: "get_classifications",
  description:
    "Get all batch classifications with activity descriptions, types, and sequence ranges. Use to understand the pre-classified activity flow.",
  parameters: [],
  execute: (_params, env) => env.getClassifications(),
};

export const GET_TRANSCRIPTS: RLMTool<BlockAnalyzerEnvironment> = {
  name: "get_transcripts",
  description:
    "Get paginated audio transcripts with speaker IDs and timestamps. Cross-reference with captures to determine meeting boundaries — transcript timestamps alone do NOT indicate meeting start/end.",
  parameters: [
    {
      name: "page",
      type: "number",
      description: "Page number (0-indexed). Each page returns up to 20 rows.",
      required: true,
    },
  ],
  execute: (params, env) => env.getTranscripts(params.page as number),
};

export const CHECK_KNOWN_CLIENTS: RLMTool<BlockAnalyzerEnvironment> = {
  name: "check_known_clients",
  description:
    "Check this user's previously seen clients/customers from past activity blocks. Returns client names, total minutes, associated apps, and last seen date. Use to: (1) reuse exact client names for consistency, (2) determine if an app/system belongs to a known client, (3) distinguish client work from internal work.",
  parameters: [],
  execute: (_params, env) => env.getKnownClients(),
};

export const EMIT_WORK_BLOCK: RLMTool<BlockAnalyzerEnvironment> = {
  name: "emit_work_block",
  description:
    "Emit a named work block. Each block is a coherent unit of work (e.g., 'Auth PR Code Review', 'Payment Flow Implementation'). Blocks should not overlap.",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Descriptive name for the work block",
      required: true,
    },
    {
      name: "startTimeMs",
      type: "number",
      description: "Start time as Unix ms timestamp",
      required: true,
    },
    {
      name: "endTimeMs",
      type: "number",
      description: "End time as Unix ms timestamp",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "1-2 sentence description of what happened",
      required: true,
    },
    {
      name: "apps",
      type: "string",
      description: "Comma-separated app names used during this block",
      required: true,
    },
    {
      name: "category",
      type: "string",
      description:
        "Activity category: development, communication, research, design, review, documentation, project_management, other",
      required: true,
    },
    {
      name: "topic",
      type: "string",
      description:
        "Higher-level topic/theme (3-5 words). Use consistent names across related blocks.",
      required: false,
    },
    {
      name: "client",
      type: "string",
      description:
        "External client/customer this work serves. Use contextual clues: systems, people, ticket IDs, Slack channels. Use EXACT names from check_known_clients when possible. Omit for genuinely internal work.",
      required: false,
    },
  ],
  execute: (params, env) => {
    const startMs = params.startTimeMs as number;
    const endMs = params.endTimeMs as number;
    if (endMs <= startMs) {
      return { error: "endTimeMs must be after startTimeMs" };
    }
    const apps =
      typeof params.apps === "string"
        ? (params.apps as string)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : Array.isArray(params.apps)
          ? (params.apps as string[])
          : [];

    const block: EmittedBlock = {
      type: "work",
      name: params.name as string,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      description: params.description as string,
      apps,
      category: (params.category as string) || "other",
      topicName: (params.topic as string) || undefined,
      clientName: (params.client as string) || undefined,
    };
    return env.emitBlock(block);
  },
};

export const EMIT_MEETING_BLOCK: RLMTool<BlockAnalyzerEnvironment> = {
  name: "emit_meeting_block",
  description:
    "Emit a named meeting block. Cross-reference story, captures (Zoom/Meet/Teams in focus), and transcripts to confirm meeting boundaries.",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Descriptive meeting name (e.g., 'Sprint Planning Standup')",
      required: true,
    },
    {
      name: "startTimeMs",
      type: "number",
      description: "Start time as Unix ms timestamp",
      required: true,
    },
    {
      name: "endTimeMs",
      type: "number",
      description: "End time as Unix ms timestamp",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "What was discussed / decided",
      required: true,
    },
    {
      name: "apps",
      type: "string",
      description: "Comma-separated meeting apps (e.g., 'Zoom, Google Meet')",
      required: true,
    },
    {
      name: "category",
      type: "string",
      description:
        "Meeting category: standup, planning, review, one_on_one, external, team_sync, other",
      required: true,
    },
    {
      name: "participants",
      type: "string",
      description: "Comma-separated participant names if identifiable",
      required: false,
    },
    {
      name: "topic",
      type: "string",
      description: "Higher-level topic (3-5 words)",
      required: false,
    },
    {
      name: "client",
      type: "string",
      description: "Client/customer this meeting relates to. Omit for purely internal meetings.",
      required: false,
    },
  ],
  execute: (params, env) => {
    const startMs = params.startTimeMs as number;
    const endMs = params.endTimeMs as number;
    if (endMs <= startMs) {
      return { error: "endTimeMs must be after startTimeMs" };
    }
    const apps =
      typeof params.apps === "string"
        ? (params.apps as string)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : Array.isArray(params.apps)
          ? (params.apps as string[])
          : [];
    const participants =
      typeof params.participants === "string"
        ? (params.participants as string)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

    const block: EmittedBlock = {
      type: "meeting",
      name: params.name as string,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      description: params.description as string,
      apps,
      category: (params.category as string) || "other",
      participants,
      topicName: (params.topic as string) || undefined,
      clientName: (params.client as string) || undefined,
    };
    return env.emitBlock(block);
  },
};

export const LIST_BLOCKS: RLMTool<BlockAnalyzerEnvironment> = {
  name: "list_blocks",
  description:
    "List all emitted blocks sorted by time. Use to review before finalizing — check for gaps, overlaps, or missing activities.",
  parameters: [],
  execute: (_params, env) => env.listBlocks(),
};

export const BLOCK_ANALYZER_TOOLS: RLMTool<BlockAnalyzerEnvironment>[] = [
  GET_SESSION_OVERVIEW,
  GET_STORY,
  GET_BLOCK_CONTENT,
  GET_CAPTURES,
  GET_CLASSIFICATIONS,
  GET_TRANSCRIPTS,
  CHECK_KNOWN_CLIENTS,
  EMIT_WORK_BLOCK,
  EMIT_MEETING_BLOCK,
  LIST_BLOCKS,
];
