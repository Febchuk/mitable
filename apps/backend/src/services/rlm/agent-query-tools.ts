/**
 * Agent Query Tools
 *
 * Tool definitions for the Agent's conversational query layer (Layer 1).
 * Each tool maps to a method on AgentQueryEnvironment.
 */

import type { AgentQueryEnvironment } from "./agent-query-environment.js";
import { resolveDateExpression } from "@mitable/shared";

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

const RESOLVE_DATES: AgentQueryTool = {
  name: "resolve_dates",
  description:
    "Convert a natural-language date expression into concrete YYYY-MM-DD date range. " +
    "Use this when the user's request involves dates not covered by the <date_reference> block. " +
    'Supports: "last 3 months", "since January", "week of March 10", "2 weeks ago", ' +
    '"2026-01-01 to 2026-02-28", etc.',
  parameters: [
    {
      name: "expression",
      type: "string",
      description:
        'The date expression to resolve (e.g. "last 3 months", "since February", "week of March 10")',
      required: true,
    },
    {
      name: "timezone",
      type: "string",
      description: "IANA timezone (e.g. America/Chicago). Defaults to server timezone if omitted.",
      required: false,
    },
  ],
  execute: async (params) => {
    const tz = params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolveDateExpression(params.expression, tz);
  },
};

export const AGENT_QUERY_TOOLS: AgentQueryTool[] = [
  GET_MY_ACTIVITY,
  GET_ACTIVITY_DETAIL,
  RESOLVE_DATES,
];

export function getAgentQueryToolByName(name: string): AgentQueryTool | undefined {
  return AGENT_QUERY_TOOLS.find((t) => t.name === name);
}
