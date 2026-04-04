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

const LIST_TEAM_MEMBERS: AgentQueryTool = {
  name: "list_team_members",
  description:
    "List all team members in the organization (names, emails, roles). Call first when the user asks about a person by name so you can match spelling.",
  parameters: [],
  execute: async (_params, env) => env.listTeamMembers(),
};

const QUERY_ORG_METRICS: AgentQueryTool = {
  name: "query_org_metrics",
  description:
    "Org-wide productivity metrics for a date range (max 31 days): averages, category mix, daily trend across the team.",
  parameters: [
    { name: "start_date", type: "string", description: "Start YYYY-MM-DD", required: true },
    { name: "end_date", type: "string", description: "End YYYY-MM-DD", required: true },
  ],
  execute: async (params, env) => env.queryOrgMetrics(params.start_date, params.end_date),
};

const QUERY_USER_METRICS: AgentQueryTool = {
  name: "query_user_metrics",
  description:
    "Daily productivity metrics for one team member (max 31 days): focus/meeting hours, categories, day summaries. Use user_name from list_team_members.",
  parameters: [
    {
      name: "user_name",
      type: "string",
      description: "First name, last name, or full name (fuzzy-matched in org)",
      required: true,
    },
    { name: "start_date", type: "string", description: "Start YYYY-MM-DD", required: true },
    { name: "end_date", type: "string", description: "End YYYY-MM-DD", required: true },
  ],
  execute: async (params, env) =>
    env.queryUserMetrics(params.user_name, params.start_date, params.end_date),
};

const QUERY_SESSION_SUMMARIES: AgentQueryTool = {
  name: "query_session_summaries",
  description:
    "Up to 20 work session narratives for one team member in a date range (max 31 days). Deeper than daily metrics alone.",
  parameters: [
    { name: "user_name", type: "string", description: "Team member name", required: true },
    { name: "start_date", type: "string", description: "Start YYYY-MM-DD", required: true },
    { name: "end_date", type: "string", description: "End YYYY-MM-DD", required: true },
  ],
  execute: async (params, env) =>
    env.querySessionSummaries(params.user_name, params.start_date, params.end_date),
};

const ADMIN_AGENT_QUERY_TOOLS: AgentQueryTool[] = [
  LIST_TEAM_MEMBERS,
  QUERY_ORG_METRICS,
  QUERY_USER_METRICS,
  QUERY_SESSION_SUMMARIES,
];

const BASE_AGENT_QUERY_TOOLS: AgentQueryTool[] = [GET_MY_ACTIVITY, GET_ACTIVITY_DETAIL];

export function getAgentQueryTools(isAdmin: boolean): AgentQueryTool[] {
  return isAdmin ? [...BASE_AGENT_QUERY_TOOLS, ...ADMIN_AGENT_QUERY_TOOLS] : BASE_AGENT_QUERY_TOOLS;
}

/** @deprecated Use getAgentQueryTools(false) */
export const AGENT_QUERY_TOOLS: AgentQueryTool[] = BASE_AGENT_QUERY_TOOLS;

export function getAgentQueryToolByName(name: string, isAdmin: boolean): AgentQueryTool | undefined {
  return getAgentQueryTools(isAdmin).find((t) => t.name === name);
}
