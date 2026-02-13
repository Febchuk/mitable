/**
 * Refinement RLM Tools
 *
 * Tools available to the summary refinement agent.
 * Uses Anthropic native tool_use format for the primary path.
 * Each tool fetches data on-demand so the LLM only loads what it needs.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../db/client";
import { sessionCaptures, sessionTranscripts, userMemories } from "../../db/schema";
import { eq, and, asc, desc, isNotNull, gte, lte } from "drizzle-orm";

// --------------------------------------------------------------------------
// Tool definitions (Anthropic native format)
// --------------------------------------------------------------------------

export const REFINEMENT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_timeline_stats",
    description:
      "Get metadata about the session: total activity count, duration, start/end times. Call this first to understand the session scope.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_activities",
    description:
      "Fetch a slice of classified activities from the session timeline by index range. Each activity has a timestamp and description. Use get_timeline_stats first to know the total count.",
    input_schema: {
      type: "object" as const,
      properties: {
        start: {
          type: "number",
          description: "Start index (0-based, inclusive)",
        },
        end: {
          type: "number",
          description: "End index (exclusive). Max 50 per call.",
        },
      },
      required: ["start", "end"],
    },
  },
  {
    name: "get_transcripts",
    description:
      "Fetch audio transcripts for the session. Optionally filter by time window. Returns speaker-attributed text with timestamps.",
    input_schema: {
      type: "object" as const,
      properties: {
        startTime: {
          type: "string",
          description:
            "ISO timestamp to filter transcripts from (optional). Omit for all transcripts.",
        },
        endTime: {
          type: "string",
          description:
            "ISO timestamp to filter transcripts until (optional). Omit for all transcripts.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_classifications",
    description:
      "Get classifier data for activities: action types (VIEWING, AUTHORING, EDITING, etc.), detected entities (people, systems), and metrics. Useful for understanding work patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        start: {
          type: "number",
          description: "Start index (0-based, inclusive)",
        },
        end: {
          type: "number",
          description: "End index (exclusive). Max 50 per call.",
        },
      },
      required: ["start", "end"],
    },
  },
  {
    name: "filter_by_type",
    description:
      "Filter activities by action type: VIEWING, NAVIGATION, AUTHORING, EDITING, READING, PASTING. Returns matching activities.",
    input_schema: {
      type: "object" as const,
      properties: {
        actionType: {
          type: "string",
          description:
            "Action type to filter by: VIEWING, NAVIGATION, AUTHORING, EDITING, READING, or PASTING",
        },
      },
      required: ["actionType"],
    },
  },
  {
    name: "get_user_preferences",
    description:
      "Load the user's saved summary style preferences from memory. Call this to check what preferences already exist before saving new ones.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "save_user_preference",
    description:
      "Save a user preference about summary style. You MUST call this whenever the user expresses ANY preference about format, tone, audience, content, length, or structure. Do not ask — just save it. Examples: 'bullet points for my manager', 'concise', 'skip timestamps', 'third person'. Multiple preferences from one conversation should each be saved separately.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description:
            "The preference as a concise sentence. e.g., 'Prefers concise bullet points over narrative prose', 'Writes summaries for manager audience, not self-reference'",
        },
      },
      required: ["content"],
    },
  },
];

// --------------------------------------------------------------------------
// Tool execution context
// --------------------------------------------------------------------------

export interface RefinementContext {
  sessionId: string;
  userId: string;
  orgId: string;
}

// --------------------------------------------------------------------------
// Tool implementations
// --------------------------------------------------------------------------

export async function executeRefinementTool(
  toolName: string,
  input: Record<string, any>,
  ctx: RefinementContext
): Promise<string> {
  switch (toolName) {
    case "get_timeline_stats":
      return await toolGetTimelineStats(ctx);
    case "get_activities":
      return await toolGetActivities(input, ctx);
    case "get_transcripts":
      return await toolGetTranscripts(input, ctx);
    case "get_classifications":
      return await toolGetClassifications(input, ctx);
    case "filter_by_type":
      return await toolFilterByType(input, ctx);
    case "get_user_preferences":
      return await toolGetUserPreferences(ctx);
    case "save_user_preference":
      return await toolSaveUserPreference(input, ctx);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// --------------------------------------------------------------------------
// Individual tool functions
// --------------------------------------------------------------------------

async function toolGetTimelineStats(ctx: RefinementContext): Promise<string> {
  const activities = await db.query.sessionCaptures.findMany({
    where: and(
      eq(sessionCaptures.sessionId, ctx.sessionId),
      isNotNull(sessionCaptures.activityDescription)
    ),
    orderBy: [asc(sessionCaptures.sequenceNumber)],
    columns: { capturedAt: true },
  });

  if (activities.length === 0) {
    return JSON.stringify({ count: 0, message: "No activities recorded" });
  }

  const first = new Date(activities[0].capturedAt);
  const last = new Date(activities[activities.length - 1].capturedAt);
  const durationMin = Math.round((last.getTime() - first.getTime()) / 60000);

  return JSON.stringify({
    totalActivities: activities.length,
    durationMinutes: durationMin,
    startTime: first.toISOString(),
    endTime: last.toISOString(),
  });
}

async function toolGetActivities(
  input: Record<string, any>,
  ctx: RefinementContext
): Promise<string> {
  const start = Math.max(0, input.start ?? 0);
  const end = Math.min(start + 50, input.end ?? start + 20);

  const activities = await db.query.sessionCaptures.findMany({
    where: and(
      eq(sessionCaptures.sessionId, ctx.sessionId),
      isNotNull(sessionCaptures.activityDescription)
    ),
    orderBy: [asc(sessionCaptures.sequenceNumber)],
    columns: {
      activityDescription: true,
      capturedAt: true,
      sequenceNumber: true,
    },
  });

  const slice = activities.slice(start, end).map((a, i) => ({
    index: start + i,
    time: new Date(a.capturedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    description: a.activityDescription,
  }));

  return JSON.stringify({ activities: slice, total: activities.length });
}

async function toolGetTranscripts(
  input: Record<string, any>,
  ctx: RefinementContext
): Promise<string> {
  const conditions = [eq(sessionTranscripts.sessionId, ctx.sessionId)];

  if (input.startTime) {
    conditions.push(gte(sessionTranscripts.startTime, new Date(input.startTime)));
  }
  if (input.endTime) {
    conditions.push(lte(sessionTranscripts.startTime, new Date(input.endTime)));
  }

  const transcripts = await db.query.sessionTranscripts.findMany({
    where: and(...conditions),
    orderBy: [asc(sessionTranscripts.startTime)],
    columns: { speakerId: true, transcript: true, startTime: true },
  });

  if (transcripts.length === 0) {
    return JSON.stringify({ transcripts: [], message: "No audio transcripts available" });
  }

  const result = transcripts.map((t) => ({
    time: new Date(t.startTime).toLocaleTimeString(),
    speaker: `Speaker ${t.speakerId}`,
    text: t.transcript,
  }));

  return JSON.stringify({ transcripts: result, count: result.length });
}

async function toolGetClassifications(
  input: Record<string, any>,
  ctx: RefinementContext
): Promise<string> {
  const start = Math.max(0, input.start ?? 0);
  const end = Math.min(start + 50, input.end ?? start + 20);

  const activities = await db.query.sessionCaptures.findMany({
    where: and(
      eq(sessionCaptures.sessionId, ctx.sessionId),
      isNotNull(sessionCaptures.activityDescription)
    ),
    orderBy: [asc(sessionCaptures.sequenceNumber)],
    columns: {
      activityDescription: true,
      capturedAt: true,
      classifierData: true,
    },
  });

  const slice = activities.slice(start, end).map((a, i) => {
    const data =
      typeof a.classifierData === "string" ? JSON.parse(a.classifierData) : a.classifierData;

    return {
      index: start + i,
      description: a.activityDescription,
      actionType: data?.actionType ?? null,
      entities: data?.entities ?? null,
      metrics: data?.metrics ?? null,
    };
  });

  return JSON.stringify({ classifications: slice, total: activities.length });
}

async function toolFilterByType(
  input: Record<string, any>,
  ctx: RefinementContext
): Promise<string> {
  const targetType = (input.actionType ?? "").toUpperCase();

  const activities = await db.query.sessionCaptures.findMany({
    where: and(
      eq(sessionCaptures.sessionId, ctx.sessionId),
      isNotNull(sessionCaptures.activityDescription)
    ),
    orderBy: [asc(sessionCaptures.sequenceNumber)],
    columns: {
      activityDescription: true,
      capturedAt: true,
      classifierData: true,
    },
  });

  const filtered = activities.filter((a) => {
    const data =
      typeof a.classifierData === "string" ? JSON.parse(a.classifierData) : a.classifierData;
    return data?.actionType === targetType;
  });

  const result = filtered.map((a) => ({
    time: new Date(a.capturedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    description: a.activityDescription,
  }));

  return JSON.stringify({
    actionType: targetType,
    matchCount: result.length,
    totalActivities: activities.length,
    activities: result,
  });
}

async function toolGetUserPreferences(ctx: RefinementContext): Promise<string> {
  const memories = await db.query.userMemories.findMany({
    where: and(eq(userMemories.userId, ctx.userId), eq(userMemories.category, "summary_style")),
    orderBy: [desc(userMemories.updatedAt)],
    columns: { id: true, content: true, updatedAt: true },
  });

  if (memories.length === 0) {
    return JSON.stringify({
      preferences: [],
      message: "No saved preferences yet",
    });
  }

  return JSON.stringify({
    preferences: memories.map((m) => ({
      id: m.id,
      content: m.content,
      lastUpdated: m.updatedAt,
    })),
  });
}

async function toolSaveUserPreference(
  input: Record<string, any>,
  ctx: RefinementContext
): Promise<string> {
  const content = input.content?.trim();
  if (!content) {
    return JSON.stringify({ error: "content is required" });
  }

  // Check for similar existing preference to avoid duplicates
  const existing = await db.query.userMemories.findMany({
    where: and(eq(userMemories.userId, ctx.userId), eq(userMemories.category, "summary_style")),
    columns: { id: true, content: true },
  });

  // Simple dedup: if any existing preference is very similar, update it instead
  const similar = existing.find((m) => {
    const a = m.content.toLowerCase();
    const b = content.toLowerCase();
    // Check if >60% of words overlap
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
    return overlap / Math.max(wordsA.size, wordsB.size) > 0.6;
  });

  if (similar) {
    await db
      .update(userMemories)
      .set({ content, updatedAt: new Date() })
      .where(eq(userMemories.id, similar.id));
    return JSON.stringify({
      saved: true,
      action: "updated",
      previousContent: similar.content,
      newContent: content,
    });
  }

  await db.insert(userMemories).values({
    userId: ctx.userId,
    orgId: ctx.orgId,
    category: "summary_style",
    content,
  });

  return JSON.stringify({ saved: true, action: "created", content });
}
