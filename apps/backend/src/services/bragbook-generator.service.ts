/**
 * Bragbook Generator Service
 *
 * Synthesizes polished, brag-worthy accomplishments from session data using Gemini.
 * Used by both the cron job (batch generation) and the "Generate Now" endpoint.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ context: "bragbook-generator" });

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return _genAI;
}

function parseLLMJson<T>(text: string): T {
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/```$/g, "")
    .trim();
  return JSON.parse(cleaned);
}

interface SessionContext {
  name: string | null;
  masterStory: string | null;
  accomplishments: string[];
  taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }>;
  keyActivities: string[];
  durationMinutes: number;
}

interface GenerationResult {
  accomplishments: string[];
  sessionsUsed: number;
}

/**
 * Generate a bragbook entry for a single user and period.
 * Pulls session data, runs through Groq, and upserts into bragbook_entries.
 */
export async function generateBragbookEntry(
  userId: string,
  organizationId: string,
  periodType: string,
  periodStart: string,
  periodEnd: string
): Promise<GenerationResult> {
  // Fetch completed sessions in the date range
  const sessions = await db
    .select({
      id: schema.monitoringSessions.id,
      name: schema.monitoringSessions.name,
      rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
      finalSummary: schema.monitoringSessions.finalSummary,
      accomplishments: schema.monitoringSessions.accomplishments,
      taskBreakdown: schema.monitoringSessions.taskBreakdown,
      keyActivities: schema.monitoringSessions.keyActivities,
      startedAt: schema.monitoringSessions.startedAt,
      endedAt: schema.monitoringSessions.endedAt,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        eq(schema.monitoringSessions.userId, userId),
        inArray(schema.monitoringSessions.status, ["ended", "ready"]),
        gte(schema.monitoringSessions.startedAt, new Date(periodStart + "T00:00:00Z")),
        lte(schema.monitoringSessions.startedAt, new Date(periodEnd + "T23:59:59Z"))
      )
    );

  if (sessions.length === 0) {
    logger.info({ userId, periodType, periodStart }, "No sessions found for period");
    return { accomplishments: [], sessionsUsed: 0 };
  }

  // Build session context for the prompt
  const sessionContexts: SessionContext[] = sessions.map((s) => ({
    name: s.name,
    masterStory: s.finalSummary || s.rawActivitySummary,
    accomplishments: (s.accomplishments ?? []) as string[],
    taskBreakdown: (s.taskBreakdown ?? []) as Array<{
      shortTitle: string;
      description: string;
      minutes: number;
    }>,
    keyActivities: (s.keyActivities ?? []) as string[],
    durationMinutes:
      s.startedAt && s.endedAt
        ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
        : 0,
  }));

  // For large session counts (monthly/quarterly), pre-aggregate to keep prompt manageable.
  // Collect all accomplishments and summaries, then send a condensed version.
  const MAX_DETAILED_SESSIONS = 20;
  let sessionsBlock: string;

  if (sessionContexts.length <= MAX_DETAILED_SESSIONS) {
    // Small enough — send full detail per session
    sessionsBlock = sessionContexts
      .map((s, i) => {
        const parts: string[] = [];
        if (s.name) parts.push(`Session: ${s.name}`);
        if (s.durationMinutes > 0) parts.push(`Duration: ${s.durationMinutes}m`);
        if (s.masterStory) parts.push(`Summary: ${s.masterStory}`);
        if (s.taskBreakdown.length > 0) {
          const tasks = s.taskBreakdown
            .map((t) => `  - ${t.shortTitle} (${t.minutes}m): ${t.description}`)
            .join("\n");
          parts.push(`Tasks:\n${tasks}`);
        }
        if (s.accomplishments.length > 0) {
          parts.push(`Raw accomplishments: ${s.accomplishments.join("; ")}`);
        }
        return `<session_${i + 1}>\n${parts.join("\n")}\n</session_${i + 1}>`;
      })
      .join("\n\n");
  } else {
    // Too many sessions — aggregate into a condensed summary
    const allAccomplishments = sessionContexts.flatMap((s) => s.accomplishments).filter(Boolean);
    const allTasks = sessionContexts.flatMap((s) => s.taskBreakdown);
    const totalMinutes = sessionContexts.reduce((sum, s) => sum + s.durationMinutes, 0);
    const sessionNames = sessionContexts.map((s) => s.name).filter(Boolean);
    const summaries = sessionContexts
      .map((s) => s.masterStory)
      .filter(Boolean)
      .slice(0, 15); // Cap summaries to keep prompt reasonable

    const parts: string[] = [];
    parts.push(`Total sessions: ${sessionContexts.length}`);
    parts.push(`Total work time: ${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m`);
    if (sessionNames.length > 0) {
      parts.push(`Session topics: ${[...new Set(sessionNames)].join(", ")}`);
    }
    if (summaries.length > 0) {
      parts.push(`\nKey session summaries:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
    }
    if (allAccomplishments.length > 0) {
      const unique = [...new Set(allAccomplishments)];
      parts.push(`\nAll raw accomplishments:\n${unique.map((a) => `- ${a}`).join("\n")}`);
    }
    if (allTasks.length > 0) {
      const topTasks = allTasks
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 20);
      parts.push(
        `\nTop tasks by time:\n${topTasks.map((t) => `- ${t.shortTitle} (${t.minutes}m): ${t.description}`).join("\n")}`
      );
    }
    sessionsBlock = `<aggregated_data>\n${parts.join("\n")}\n</aggregated_data>`;
  }

  const prompt = `You are writing a bragbook entry — a curated list of accomplishments worth celebrating from a work period.

<sessions>
${sessionsBlock}
</sessions>

<rules>
- Synthesize into 3-8 polished accomplishment bullets
- Deduplicate across sessions — merge related items into one strong bullet
- Use strong action verbs: Shipped, Launched, Fixed, Completed, Led, Built, Designed, Resolved, Optimized, Implemented
- Be specific: include project names, feature names, customer/client names when available
- Skip mundane activities (checking email, browsing, routine standups) — only brag-worthy items
- Each bullet should be 1 sentence, concise but specific
- If no meaningful accomplishments exist, return empty array
- Do NOT fabricate details not present in the session data
</rules>

Respond with valid JSON only:
{ "accomplishments": ["Accomplishment 1", "Accomplishment 2"] }`;

  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text) {
      logger.warn({ userId, periodStart }, "Empty Gemini response");
      return { accomplishments: [], sessionsUsed: sessions.length };
    }

    const parsed = parseLLMJson<{ accomplishments?: string[] }>(text);
    const accomplishments = Array.isArray(parsed.accomplishments)
      ? parsed.accomplishments.filter(
          (a): a is string => typeof a === "string" && a.trim().length > 0
        )
      : [];

    // Upsert into bragbook_entries
    const existing = await db
      .select({ id: schema.bragbookEntries.id, source: schema.bragbookEntries.source })
      .from(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, periodType),
          eq(schema.bragbookEntries.periodStart, periodStart)
        )
      )
      .limit(1);

    if (existing[0]) {
      // Only overwrite if not user-edited
      if (existing[0].source === "user-edited") {
        logger.info({ userId, periodStart }, "Skipping — user-edited entry exists");
        return { accomplishments, sessionsUsed: sessions.length };
      }
      await db
        .update(schema.bragbookEntries)
        .set({ accomplishments, source: "auto-generated", updatedAt: new Date() })
        .where(eq(schema.bragbookEntries.id, existing[0].id));
    } else {
      await db.insert(schema.bragbookEntries).values({
        userId,
        organizationId,
        periodType,
        periodStart,
        accomplishments,
        source: "auto-generated",
      });
    }

    logger.info(
      { userId, periodStart, count: accomplishments.length, sessions: sessions.length },
      "Bragbook entry generated"
    );
    return { accomplishments, sessionsUsed: sessions.length };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { err: errMsg, errStack, userId, periodStart },
      "Failed to generate bragbook entry"
    );
    throw error;
  }
}

/**
 * Generate bragbook entries for all active users with sessions in the period.
 * Used by the cron job.
 */
export async function generateForAllUsers(
  periodType: string,
  periodStart: string,
  periodEnd: string
): Promise<{ usersProcessed: number; usersSkipped: number; usersFailed: number }> {
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  // Find all users who have completed sessions in this period
  const usersWithSessions = await db
    .selectDistinct({
      userId: schema.monitoringSessions.userId,
      organizationId: schema.monitoringSessions.organizationId,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        inArray(schema.monitoringSessions.status, ["ended", "ready"]),
        gte(schema.monitoringSessions.startedAt, new Date(periodStart + "T00:00:00Z")),
        lte(schema.monitoringSessions.startedAt, new Date(periodEnd + "T23:59:59Z"))
      )
    );

  if (usersWithSessions.length === 0) {
    logger.info({ periodType, periodStart }, "No users with sessions in period");
    return { usersProcessed: 0, usersSkipped: 0, usersFailed: 0 };
  }

  // Check for existing user-edited entries to skip
  const editedEntries = await db
    .select({ userId: schema.bragbookEntries.userId })
    .from(schema.bragbookEntries)
    .where(
      and(
        eq(schema.bragbookEntries.periodType, periodType),
        eq(schema.bragbookEntries.periodStart, periodStart),
        eq(schema.bragbookEntries.source, "user-edited")
      )
    );
  const editedUserIds = new Set(editedEntries.map((e) => e.userId));

  for (const { userId, organizationId } of usersWithSessions) {
    if (editedUserIds.has(userId)) {
      skipped++;
      continue;
    }

    try {
      await generateBragbookEntry(userId, organizationId, periodType, periodStart, periodEnd);
      processed++;
    } catch (error) {
      logger.error({ error, userId }, "Failed to generate bragbook for user");
      failed++;
    }
  }

  return { usersProcessed: processed, usersSkipped: skipped, usersFailed: failed };
}
