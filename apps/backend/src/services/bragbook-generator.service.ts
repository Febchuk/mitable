/**
 * Bragbook Generator Service
 *
 * Synthesizes polished, brag-worthy accomplishments from session data using Gemini.
 * Uses hierarchical generation: weekly from sessions, monthly from weeks, quarterly from months.
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

function getModel() {
  return getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  });
}

function parseLLMJson<T>(text: string): T {
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/```$/g, "")
    .trim();
  return JSON.parse(cleaned);
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

// ---------------------------------------------------------------------------
// Period helpers (mirrored from my-bragbook route)
// ---------------------------------------------------------------------------

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getPeriodEnd(periodStart: Date, periodType: string): Date {
  const end = new Date(periodStart);
  switch (periodType) {
    case "weekly":
      end.setDate(end.getDate() + 6);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);
      break;
    case "quarterly":
      end.setMonth(end.getMonth() + 3);
      end.setDate(end.getDate() - 1);
      break;
  }
  return end;
}

/**
 * Get all weekly period starts within a month (periodStart = 1st of month).
 */
function getWeeksInMonth(monthStart: string): string[] {
  const start = new Date(monthStart + "T00:00:00");
  const endOfMonth = getPeriodEnd(start, "monthly");
  const weeks: string[] = [];
  let cursor = getWeekStart(start);
  // If the week starts before the month, still include it
  while (cursor <= endOfMonth) {
    weeks.push(formatDateStr(cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

/**
 * Get all monthly period starts within a quarter (periodStart = 1st of quarter).
 */
function getMonthsInQuarter(quarterStart: string): string[] {
  const start = new Date(quarterStart + "T00:00:00");
  return [0, 1, 2].map((offset) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + offset);
    return formatDateStr(d);
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------

async function upsertBragbookEntry(
  userId: string,
  organizationId: string,
  periodType: string,
  periodStart: string,
  accomplishments: string[]
): Promise<void> {
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
    if (existing[0].source === "user-edited") {
      logger.info(
        { userId, periodStart, periodType },
        "Skipping upsert — user-edited entry exists"
      );
      return;
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
}

// ---------------------------------------------------------------------------
// LLM call helper
// ---------------------------------------------------------------------------

async function callGemini(prompt: string): Promise<string[]> {
  const model = getModel();
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  if (!text) return [];

  const parsed = parseLLMJson<{ accomplishments?: string[] }>(text);
  return Array.isArray(parsed.accomplishments)
    ? parsed.accomplishments.filter(
        (a): a is string => typeof a === "string" && a.trim().length > 0
      )
    : [];
}

// ---------------------------------------------------------------------------
// Weekly: generate from raw sessions
// ---------------------------------------------------------------------------

async function generateWeekly(
  userId: string,
  organizationId: string,
  periodStart: string,
  periodEnd: string
): Promise<GenerationResult> {
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
    return { accomplishments: [], sessionsUsed: 0 };
  }

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

  const sessionsBlock = sessionContexts
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

  const prompt = `You are writing a bragbook entry — a curated list of accomplishments worth celebrating from a work week.

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

  const accomplishments = await callGemini(prompt);

  await upsertBragbookEntry(userId, organizationId, "weekly", periodStart, accomplishments);

  logger.info(
    { userId, periodStart, count: accomplishments.length, sessions: sessions.length },
    "Weekly bragbook entry generated"
  );
  return { accomplishments, sessionsUsed: sessions.length };
}

// ---------------------------------------------------------------------------
// Monthly: synthesize from weekly entries
// ---------------------------------------------------------------------------

async function generateMonthly(
  userId: string,
  organizationId: string,
  periodStart: string,
  _periodEnd: string
): Promise<GenerationResult> {
  const weekStarts = getWeeksInMonth(periodStart);

  // Ensure weekly entries exist for each week
  let totalSessions = 0;
  for (const weekStart of weekStarts) {
    const weekEnd = formatDateStr(getPeriodEnd(new Date(weekStart + "T00:00:00"), "weekly"));

    // Check if weekly entry already exists
    const existing = await db
      .select({ id: schema.bragbookEntries.id })
      .from(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, "weekly"),
          eq(schema.bragbookEntries.periodStart, weekStart)
        )
      )
      .limit(1);

    if (!existing[0]) {
      const result = await generateWeekly(userId, organizationId, weekStart, weekEnd);
      totalSessions += result.sessionsUsed;
    }
  }

  // Fetch all weekly entries for this month
  const weeklyEntries = await db
    .select({
      periodStart: schema.bragbookEntries.periodStart,
      accomplishments: schema.bragbookEntries.accomplishments,
    })
    .from(schema.bragbookEntries)
    .where(
      and(
        eq(schema.bragbookEntries.userId, userId),
        eq(schema.bragbookEntries.periodType, "weekly"),
        inArray(schema.bragbookEntries.periodStart, weekStarts)
      )
    );

  const allAccomplishments = weeklyEntries.flatMap((e) => (e.accomplishments as string[]) || []);

  if (allAccomplishments.length === 0) {
    return { accomplishments: [], sessionsUsed: totalSessions };
  }

  const weeksBlock = weeklyEntries
    .map((e) => {
      const items = (e.accomplishments as string[]) || [];
      return `Week of ${e.periodStart}:\n${items.map((a) => `- ${a}`).join("\n")}`;
    })
    .join("\n\n");

  const prompt = `You are writing a monthly bragbook entry — a curated highlight reel of the month's top accomplishments.

Below are the weekly accomplishment entries for this month:

${weeksBlock}

<rules>
- Synthesize into 5-10 polished monthly highlights
- Merge related weekly items into stronger, higher-level bullets
- Prioritize impact: what shipped, what was completed, what moved the needle
- Use strong action verbs and be specific with names, numbers, and outcomes
- Each bullet should be 1 sentence, concise but impactful
- Do NOT fabricate details not in the weekly entries
</rules>

Respond with valid JSON only:
{ "accomplishments": ["Accomplishment 1", "Accomplishment 2"] }`;

  const accomplishments = await callGemini(prompt);

  await upsertBragbookEntry(userId, organizationId, "monthly", periodStart, accomplishments);

  logger.info(
    { userId, periodStart, count: accomplishments.length, weeks: weeklyEntries.length },
    "Monthly bragbook entry generated"
  );
  return { accomplishments, sessionsUsed: totalSessions };
}

// ---------------------------------------------------------------------------
// Quarterly: synthesize from monthly entries
// ---------------------------------------------------------------------------

async function generateQuarterly(
  userId: string,
  organizationId: string,
  periodStart: string,
  _periodEnd: string
): Promise<GenerationResult> {
  const monthStarts = getMonthsInQuarter(periodStart);

  // Ensure monthly entries exist for each month
  let totalSessions = 0;
  for (const monthStart of monthStarts) {
    const monthEnd = formatDateStr(getPeriodEnd(new Date(monthStart + "T00:00:00"), "monthly"));

    const existing = await db
      .select({ id: schema.bragbookEntries.id })
      .from(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, "monthly"),
          eq(schema.bragbookEntries.periodStart, monthStart)
        )
      )
      .limit(1);

    if (!existing[0]) {
      const result = await generateMonthly(userId, organizationId, monthStart, monthEnd);
      totalSessions += result.sessionsUsed;
    }
  }

  // Fetch all monthly entries for this quarter
  const monthlyEntries = await db
    .select({
      periodStart: schema.bragbookEntries.periodStart,
      accomplishments: schema.bragbookEntries.accomplishments,
    })
    .from(schema.bragbookEntries)
    .where(
      and(
        eq(schema.bragbookEntries.userId, userId),
        eq(schema.bragbookEntries.periodType, "monthly"),
        inArray(schema.bragbookEntries.periodStart, monthStarts)
      )
    );

  const allAccomplishments = monthlyEntries.flatMap((e) => (e.accomplishments as string[]) || []);

  if (allAccomplishments.length === 0) {
    return { accomplishments: [], sessionsUsed: totalSessions };
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const monthsBlock = monthlyEntries
    .map((e) => {
      const d = new Date(e.periodStart + "T00:00:00");
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      const items = (e.accomplishments as string[]) || [];
      return `${label}:\n${items.map((a) => `- ${a}`).join("\n")}`;
    })
    .join("\n\n");

  const prompt = `You are writing a quarterly bragbook entry — a strategic summary of the quarter's most significant achievements.

Below are the monthly accomplishment entries for this quarter:

${monthsBlock}

<rules>
- Synthesize into 5-8 high-impact quarterly highlights
- Focus on themes, outcomes, and measurable results across the quarter
- Elevate from tactical (what was done) to strategic (what impact it had)
- Merge related monthly items into comprehensive achievement statements
- Use strong action verbs and include specific outcomes where available
- Each bullet should be 1-2 sentences, emphasizing impact
- Do NOT fabricate details not in the monthly entries
</rules>

Respond with valid JSON only:
{ "accomplishments": ["Accomplishment 1", "Accomplishment 2"] }`;

  const accomplishments = await callGemini(prompt);

  await upsertBragbookEntry(userId, organizationId, "quarterly", periodStart, accomplishments);

  logger.info(
    { userId, periodStart, count: accomplishments.length, months: monthlyEntries.length },
    "Quarterly bragbook entry generated"
  );
  return { accomplishments, sessionsUsed: totalSessions };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a bragbook entry for a single user and period.
 * Weekly: generated from raw sessions.
 * Monthly: synthesized from weekly entries (auto-generates missing weeks).
 * Quarterly: synthesized from monthly entries (auto-generates missing months).
 */
export async function generateBragbookEntry(
  userId: string,
  organizationId: string,
  periodType: string,
  periodStart: string,
  periodEnd: string
): Promise<GenerationResult> {
  try {
    switch (periodType) {
      case "weekly":
        return await generateWeekly(userId, organizationId, periodStart, periodEnd);
      case "monthly":
        return await generateMonthly(userId, organizationId, periodStart, periodEnd);
      case "quarterly":
        return await generateQuarterly(userId, organizationId, periodStart, periodEnd);
      default:
        return await generateWeekly(userId, organizationId, periodStart, periodEnd);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error(
      { err: errMsg, errStack, userId, periodType, periodStart },
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
