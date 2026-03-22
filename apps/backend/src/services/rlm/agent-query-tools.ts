/**
 * Agent Query Tools
 *
 * Tool definitions for the Agent's conversational query layer (Layer 1).
 * Each tool maps to a method on AgentQueryEnvironment.
 */

import type { AgentQueryEnvironment } from "./agent-query-environment.js";

export interface AgentQueryToolParam {
  name: string;
  type: "string";
  description: string;
  required: boolean;
}

export interface AgentQueryTool {
  name: string;
  description: string;
  parameters: AgentQueryToolParam[];
  execute: (params: Record<string, string>, env: AgentQueryEnvironment) => Promise<unknown>;
}

const GET_MY_ACTIVITY: AgentQueryTool = {
  name: "get_my_activity",
  description:
    "Fetch the user's activity for a date range (max 31 days, default last 30 days). " +
    "Returns activity blocks (including Granola/Fireflies meetings), daily summaries with " +
    "pre-computed metrics and category breakdowns, work sessions with task breakdowns, and documents. " +
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

const GET_ACTIVITY_DETAIL: AgentQueryTool = {
  name: "get_activity_detail",
  description:
    "Drill into a specific activity item by ID. Returns full details: meeting transcripts " +
    "for activity blocks, task breakdowns for sessions, or full content for documents.",
  parameters: [
    {
      name: "id",
      type: "string",
      description: "The item ID (from get_my_activity results)",
      required: true,
    },
    {
      name: "type",
      type: "string",
      description: "Item type: 'block', 'session', or 'document'",
      required: true,
    },
  ],
  execute: async (params, env) =>
    env.getActivityDetail(params.id, params.type as "block" | "session" | "document"),
};

export const AGENT_QUERY_TOOLS: AgentQueryTool[] = [GET_MY_ACTIVITY, GET_ACTIVITY_DETAIL];

export function getAgentQueryToolByName(name: string): AgentQueryTool | undefined {
  return AGENT_QUERY_TOOLS.find((t) => t.name === name);
}
