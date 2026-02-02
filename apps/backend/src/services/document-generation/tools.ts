/**
 * Document Generation RLM Tools
 *
 * Tool definitions for Groq function calling.
 * Each tool queries the DB environment in bounded slices.
 */

import type { DocumentGenerationEnvironment } from "./environment.js";
import * as env from "./environment.js";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  name: string;
  content: string;
}

/**
 * Tool schemas for Groq function calling
 */
export const DOCUMENT_GENERATION_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_sessions_overview",
      description:
        "Get high-level overview of all sessions in scope (names, dates, durations, top apps)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_session_timeline",
      description: "Get chronological timeline of activities for a specific session",
      parameters: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "The session ID to get timeline for",
          },
          limit: {
            type: "number",
            description: "Maximum number of activities to return (default: all)",
          },
        },
        required: ["sessionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_session_summary",
      description: "Get the narrative summary (storyteller output) for a specific session",
      parameters: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "The session ID to get summary for",
          },
        },
        required: ["sessionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_summaries",
      description:
        "Get narrative summaries for all sessions in scope at once (more efficient than calling get_session_summary multiple times)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_time_breakdown",
      description: "Get application time breakdown across all sessions or for specific sessions",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_applications",
      description: "Get the top N applications by time spent across all sessions",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of top applications to return (default: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "filter_sessions_by_priority",
      description:
        "Filter sessions by priority level (high = has accomplishments, medium = has activities, low = short sessions)",
      parameters: {
        type: "object",
        properties: {
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Priority level to filter by",
          },
        },
        required: ["priority"],
      },
    },
  },
];

/**
 * Execute a tool call and return the result
 */
export async function executeToolCall(
  toolCall: ToolCall,
  environment: DocumentGenerationEnvironment
): Promise<ToolResult> {
  const { name, arguments: argsStr } = toolCall.function;
  const args = JSON.parse(argsStr);

  let result: any;

  try {
    switch (name) {
      case "get_sessions_overview": {
        const metadata = await env.getSessionsMetadata(environment);
        const topApps = await env.getTopApplications(environment, 5);

        result = {
          totalSessions: metadata.length,
          dateRange: environment.dateRange
            ? `${environment.dateRange.start.toLocaleDateString()} to ${environment.dateRange.end.toLocaleDateString()}`
            : "All time",
          sessions: metadata.map((s) => ({
            id: s.id,
            name: s.name,
            date: s.startedAt.toLocaleDateString(),
            time: s.startedAt.toLocaleTimeString(),
            duration: `${Math.floor(s.duration / 60)}m ${s.duration % 60}s`,
          })),
          topApplications: topApps,
        };
        break;
      }

      case "get_session_timeline": {
        const { sessionId, limit } = args;
        const timeline = await env.getSessionTimeline(environment, sessionId, limit);

        result = {
          sessionId,
          activityCount: timeline.length,
          activities: timeline.map((a) => ({
            time: a.timestamp.toLocaleTimeString(),
            action: a.actionType,
            application: a.application,
            description: a.description,
          })),
        };
        break;
      }

      case "get_session_summary": {
        const { sessionId } = args;
        const summary = await env.getSessionSummary(sessionId);

        // Fallback to timeline if summary not available
        if (!summary) {
          const timeline = await env.getSessionTimeline(environment, sessionId, 10);
          const timelineText =
            timeline.length > 0
              ? timeline
                  .map((a) => `${a.timestamp.toLocaleTimeString()}: ${a.description}`)
                  .join("\n")
              : "No activity data available";

          result = {
            sessionId,
            summary: `Summary not available. Activity timeline:\n${timelineText}`,
            fallbackUsed: true,
          };
        } else {
          result = {
            sessionId,
            summary,
            fallbackUsed: false,
          };
        }
        break;
      }

      case "get_time_breakdown": {
        const breakdowns = await env.getTimeBreakdownAcrossSessions(environment);

        result = {
          sessions: breakdowns.map((b) => ({
            sessionName: b.sessionName,
            applications: b.applications,
          })),
        };
        break;
      }

      case "get_top_applications": {
        const { limit = 10 } = args;
        const topApps = await env.getTopApplications(environment, limit);

        result = {
          applications: topApps,
        };
        break;
      }

      case "get_all_summaries": {
        const summaries: Array<{ sessionId: string; sessionName: string; summary: string | null }> =
          [];

        for (const sessionId of environment.sessionIds) {
          const summary = await env.getSessionSummary(sessionId);
          const metadata = await env.getSessionsMetadata(environment);
          const sessionName = metadata.find((s) => s.id === sessionId)?.name || "Unnamed Session";

          summaries.push({
            sessionId,
            sessionName,
            summary,
          });
        }

        result = {
          totalSessions: summaries.length,
          summaries: summaries.map((s) => ({
            sessionId: s.sessionId,
            sessionName: s.sessionName,
            summary: s.summary || "[No summary - use get_session_timeline to see activities]",
            hasSummary: !!s.summary,
          })),
        };
        break;
      }

      case "filter_sessions_by_priority": {
        const { priority } = args;
        const sessionIds = await env.filterSessionsByPriority(environment, priority);
        const metadata = await env.getSessionsMetadata(environment);
        const filtered = metadata.filter((s) => sessionIds.includes(s.id));

        result = {
          priority,
          matchingCount: filtered.length,
          sessions: filtered.map((s) => ({
            id: s.id,
            name: s.name,
            date: s.startedAt.toLocaleDateString(),
          })),
        };
        break;
      }

      default:
        result = { error: `Unknown tool: ${name}` };
    }

    return {
      tool_call_id: toolCall.id,
      role: "tool",
      name,
      content: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    return {
      tool_call_id: toolCall.id,
      role: "tool",
      name,
      content: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
