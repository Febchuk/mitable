/**
 * Shared types for the teacher chat agent. The client holds the transcript and
 * replays it to the server each turn (the turn route is stateless), so these
 * shapes cross the network in both directions.
 */

export type AgentRole = "user" | "assistant";

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

/** The write tools. Each becomes a confirm card instead of executing inline. */
export const WRITE_TOOLS = [
  "mark_attendance",
  "record_progress",
  "add_observation",
  "create_daily_report",
  "edit_report_section",
  "record_grade",
] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

/**
 * A pending write the teacher must confirm. `summary` is what the confirm card
 * shows; `args` is validated again server-side (per-tool) before it is applied.
 */
export interface AgentProposal {
  id: string;
  tool: WriteTool;
  summary: string;
  args: Record<string, unknown>;
}

export interface AgentTurnResult {
  reply: string;
  proposals: AgentProposal[];
}

export interface AgentApplyResult {
  ok: boolean;
  message: string;
}
