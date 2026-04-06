/* =============================================================================
 * DEPRECATED — Ask RLM tool definitions.
 * Not in active use. Paired with ask-rlm-prompts + /admin/ask/chat; slated for removal.
 * Do not extend. Org-wide queries: OrgTeamActivityQueryService + Layer 1 admin tools.
 * =============================================================================
 *
 * Predefined tools for the legacy Ask AI tool loop (max 31 days per query).
 */

import { AskEnvironment } from "./ask-environment";

export interface AskToolParameter {
  name: string;
  type: "string" | "number";
  description: string;
  required: boolean;
}

export interface AskTool {
  name: string;
  description: string;
  parameters: AskToolParameter[];
  execute: (params: any, env: AskEnvironment) => Promise<any>;
}

export const LIST_TEAM_MEMBERS: AskTool = {
  name: "list_team_members",
  description:
    "List all tracked team members in the organization with names and roles. Call this first to know who you can query.",
  parameters: [],
  execute: async (_params, env) => env.listTeamMembers(),
};

export const QUERY_ORG_METRICS: AskTool = {
  name: "query_org_metrics",
  description:
    "Get org-level productivity metrics for a date range (max 31 days). Returns averages, category breakdown, and daily trend.",
  parameters: [
    { name: "start_date", type: "string", description: "Start date YYYY-MM-DD", required: true },
    { name: "end_date", type: "string", description: "End date YYYY-MM-DD", required: true },
  ],
  execute: async (params, env) => env.queryOrgMetrics(params.start_date, params.end_date),
};

export const QUERY_USER_METRICS: AskTool = {
  name: "query_user_metrics",
  description:
    "Get detailed productivity metrics for a specific team member (max 31 days). Returns daily breakdown, categories, and day summaries.",
  parameters: [
    {
      name: "user_name",
      type: "string",
      description: "Name (e.g. 'Aurel' or 'Aurel Npounengnong')",
      required: true,
    },
    { name: "start_date", type: "string", description: "Start date YYYY-MM-DD", required: true },
    { name: "end_date", type: "string", description: "End date YYYY-MM-DD", required: true },
  ],
  execute: async (params, env) =>
    env.queryUserMetrics(params.user_name, params.start_date, params.end_date),
};

export const QUERY_SESSION_SUMMARIES: AskTool = {
  name: "query_session_summaries",
  description:
    "Get individual session summaries for a team member (max 31 days). Returns session titles, durations, and narrative summaries.",
  parameters: [
    { name: "user_name", type: "string", description: "Name of the team member", required: true },
    { name: "start_date", type: "string", description: "Start date YYYY-MM-DD", required: true },
    { name: "end_date", type: "string", description: "End date YYYY-MM-DD", required: true },
  ],
  execute: async (params, env) =>
    env.querySessionSummaries(params.user_name, params.start_date, params.end_date),
};

export const ASK_TOOLS: AskTool[] = [
  LIST_TEAM_MEMBERS,
  QUERY_ORG_METRICS,
  QUERY_USER_METRICS,
  QUERY_SESSION_SUMMARIES,
];

export function getAskToolByName(name: string): AskTool | undefined {
  return ASK_TOOLS.find((t) => t.name === name);
}
