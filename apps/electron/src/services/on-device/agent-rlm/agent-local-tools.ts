/**
 * Agent Local Tools
 *
 * Tool definitions for the on-device Agent RLM.
 * Mirrors agent-query-tools.ts (backend) but executes against local SQLite.
 */

import type { AgentLocalEnvironment } from "./agent-local-environment";

export interface AgentLocalToolParam {
  name: string;
  type: "string";
  description: string;
  required: boolean;
}

export interface AgentLocalTool {
  name: string;
  description: string;
  parameters: AgentLocalToolParam[];
  execute: (params: Record<string, string>, env: AgentLocalEnvironment) => Promise<unknown>;
}

const GET_MY_ACTIVITY: AgentLocalTool = {
  name: "get_my_activity",
  description:
    "Fetch the user's locally captured work sessions for a date range (max 31 days, default last 30 days). " +
    "Returns session summaries with duration, app usage, and status. " +
    "For broad questions, make multiple calls covering different month windows.",
  parameters: [
    {
      name: "start_date",
      type: "string",
      description: "Start date YYYY-MM-DD (default: 30 days ago)",
      required: false,
    },
    {
      name: "end_date",
      type: "string",
      description: "End date YYYY-MM-DD (default: today)",
      required: false,
    },
  ],
  execute: async (params, env) => env.getMyActivity(params.start_date, params.end_date),
};

const GET_ACTIVITY_DETAIL: AgentLocalTool = {
  name: "get_activity_detail",
  description:
    "Drill into a specific session by ID. Returns the full block.md file for that session — " +
    "this includes the summary, all frame-by-frame screen descriptions, speaker-attributed audio " +
    "transcripts, and batch activity narratives. This is the richest data available for a session.",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "The session ID (from get_my_activity results)",
      required: true,
    },
    {
      name: "type",
      type: "string",
      description: "Item type: 'session' (only type available locally)",
      required: true,
    },
  ],
  execute: async (params, env) =>
    env.getActivityDetail(params.id, params.type as "block" | "session" | "document"),
};

const SEARCH_DOCUMENTS: AgentLocalTool = {
  name: "search_documents",
  description:
    "Search through the user's documents by content. Covers everything in the Docs tab: " +
    "uploaded files (PDFs, DOCX, XLSX, etc.) and Mitable-generated documents. " +
    "Returns the most relevant text chunks with their document names.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query — keywords or phrases to find in document content",
      required: true,
    },
    {
      name: "limit",
      type: "string",
      description: "Max results to return (default: 10)",
      required: false,
    },
  ],
  execute: async (params, env) =>
    env.searchDocuments(params.query, params.limit ? parseInt(params.limit, 10) : undefined),
};

const LIST_DOCUMENTS: AgentLocalTool = {
  name: "list_documents",
  description:
    "List all documents the user has in their Docs tab. Returns names, types, sizes, and dates. " +
    "Use this to see what's available before searching, or when the user asks about their documents.",
  parameters: [],
  execute: async (_params, env) => env.listDocuments(),
};

export const AGENT_LOCAL_TOOLS: AgentLocalTool[] = [
  GET_MY_ACTIVITY,
  GET_ACTIVITY_DETAIL,
  SEARCH_DOCUMENTS,
  LIST_DOCUMENTS,
];

export function getAgentLocalToolByName(name: string): AgentLocalTool | undefined {
  return AGENT_LOCAL_TOOLS.find((t) => t.name === name);
}
