import { parseJsonResponse } from "../../domains/shared-infra/lib/parse-json.js";

/**
 * Capture Rollup Job (Lightweight Layer 1)
 *
 * Runs every 10 minutes. For each user with sessions today:
 *   1. Reads all session_captures (app names, activity descriptions, timestamps)
 *   2. Computes app breakdown (app → minutes) deterministically
 *   3. Calls Groq (fast) to classify activities from raw capture data:
 *      → activity name, category, duration (high-level, no narrative)
 *   4. Derives category breakdown + meeting/work split from Groq output
 *   5. Upserts user_daily_activities with everything
 *
 * The full Day Analyzer RLM (30-min schedule) later adds the rich
 * narrative, detailed blocks, and accomplishments.
 */

import Groq from "groq-sdk";
import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import { AppBreakdownEntry, CategoryBreakdownEntry } from "../../db/schema/daily-activities.schema";
import { config } from "../../config";
import { createLogger } from "../../domains/shared-infra/lib/logger.js";
import {
  getKnownCustomers,
  getOrgName,
  addDiscoveredCustomers,
} from "../../services/known-customers.service";

const groq = new Groq({ apiKey: config.groq.apiKey });

const logger = createLogger({ context: "capture-rollup-job" });

// ── Groq Activity Classification ─────────────────────────────────

interface ClassifiedActivity {
  activity: string;
  category: string;
  minutes: number;
  topic?: string;
  subscriber?: string;
}

/**
 * Use Groq to classify the user's captures into high-level activities.
 * Input: raw capture data (app names, activity descriptions, timestamps).
 * Output: list of { activity, category, minutes }.
 * No hardcoded app→category maps — the LLM figures it out from context.
 */
async function classifyActivitiesWithGroq(
  captureLines: string[],
  totalActiveMinutes: number,
  knownCustomers: string[] = [],
  orgName: string | null = null
): Promise<ClassifiedActivity[]> {
  // Deduplicate and limit to keep prompt small
  const uniqueLines = [...new Set(captureLines)].slice(0, 80);

  const orgContext = orgName
    ? `**Organization:** ${orgName} (this is the user's own company — NOT an external customer)\n\n`
    : "";

  const knownCustomerSection =
    knownCustomers.length > 0
      ? `**KNOWN CUSTOMERS (external clients — check these first):**\n${knownCustomers.map((c) => `- ${c}`).join("\n")}\n\n`
      : "";

  const prompt = `You are a work activity classifier. Given a list of screen capture observations from a user's workday, classify them into high-level activities.

${orgContext}${knownCustomerSection}For each activity, provide:
- "activity": A short description of the activity (e.g., "Code review in VS Code", "Team standup on Zoom", "Writing docs in Notion")
- "category": The type of activity (e.g., "Development", "Meeting", "Communication", "Documentation", "Design", "Research", "Project Management", etc.)
- "minutes": Estimated duration in minutes
- "topic": A higher-level theme (3-5 words) grouping related activities (e.g., "Debugging API Issues", "Sprint Planning", "Client Onboarding"). Use consistent names across related activities.
- "subscriber": Client/customer name. FIRST check against the known customers list above. Look for partial matches in window titles, Slack channels (#acme-support → "Acme"), ticket titles (ACME-1234 → "Acme"). Assign a known customer whenever there's a reasonable match. If clearly a NEW customer not in the list, include them. null only if clearly internal work. **NAME FORMAT:** When a known customer matches, use their name EXACTLY as it appears in the list. For NEW customers, use the full official name with abbreviation in parentheses if one exists, e.g., "Education Domain Company (EDC)". Never use abbreviations alone.

Rules:
- Merge similar/consecutive captures into single activities (don't list every capture separately)
- The total minutes across all activities should roughly equal ${totalActiveMinutes}
- Be specific about what was being done, not just the app name
- If it looks like a meeting (video call, conference, huddle), category must be "Meeting"

Respond in JSON:
{ "activities": [ { "activity": "...", "category": "...", "minutes": N, "topic": "...", "subscriber": "..." or null }, ... ] }

Capture observations (chronological):
${uniqueLines.map((l) => `• ${l}`).join("\n")}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty Groq response");

    const parsed = parseJsonResponse<{ activities?: ClassifiedActivity[] }>(content);
    if (!Array.isArray(parsed.activities) || parsed.activities.length === 0) {
      throw new Error("No activities in Groq response");
    }

    return parsed.activities;
  } catch (error) {
    logger.warn({ error: String(error) }, "Groq activity classification failed — using fallback");
    // Fallback: single generic activity
    return [{ activity: "General work activity", category: "Work", minutes: totalActiveMinutes }];
  }
}

/**
 * Fetch master story summaries for sessions.
 */
async function fetchSessionSummaries(
  sessionIds: string[]
): Promise<{ sessionId: string; narrative: string }[]> {
  if (sessionIds.length === 0) return [];
  return db
    .select({
      sessionId: schema.sessionSummaries.sessionId,
      narrative: schema.sessionSummaries.narrativeSummary,
    })
    .from(schema.sessionSummaries)
    .where(
      sql`${schema.sessionSummaries.sessionId} IN (${sql.join(
        sessionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    );
}

/**
 * Fetch transcript text for sessions.
 */
async function fetchSessionTranscripts(
  sessionIds: string[]
): Promise<{ sessionId: string; transcript: string }[]> {
  if (sessionIds.length === 0) return [];
  return db
    .select({
      sessionId: schema.sessionTranscripts.sessionId,
      transcript: schema.sessionTranscripts.transcript,
    })
    .from(schema.sessionTranscripts)
    .where(
      sql`${schema.sessionTranscripts.sessionId} IN (${sql.join(
        sessionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    );
}

/**
 * Run the capture-based rollup for all users with sessions today.
 */
export async function runCaptureRollup(targetDate?: Date): Promise<{
  usersProcessed: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();
  const day = targetDate ? new Date(targetDate) : new Date();
  day.setHours(0, 0, 0, 0);
  const todayStr = day.toISOString().split("T")[0]!;
  const tomorrow = new Date(day);
  tomorrow.setDate(tomorrow.getDate() + 1);

  logger.info({ date: todayStr }, "Starting capture rollup job");

  // Find all users who have sessions today (any status — active, ended, completed, etc.)
  const usersWithSessions = await db
    .selectDistinct({
      userId: schema.monitoringSessions.userId,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        gte(schema.monitoringSessions.startedAt, day),
        lte(schema.monitoringSessions.startedAt, tomorrow)
      )
    );

  let usersProcessed = 0;

  for (const { userId } of usersWithSessions) {
    try {
      await processUserCaptures(userId, day, tomorrow, todayStr);
      usersProcessed++;
    } catch (error) {
      logger.error({ userId, error: String(error) }, "Failed to process user captures");
    }
  }

  const totalTimeMs = Date.now() - startTime;
  logger.info({ usersProcessed, totalTimeMs }, "Capture rollup job completed");

  return { usersProcessed, totalTimeMs };
}

/**
 * Process a single user's captures for today and upsert their daily activity.
 */
async function processUserCaptures(
  userId: string,
  today: Date,
  tomorrow: Date,
  todayStr: string
): Promise<void> {
  // Get user's org
  const [user] = await db
    .select({
      id: schema.users.id,
      organizationId: schema.users.organizationId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) return;

  // Fetch known customers and org name for this org
  const [knownCustomers, orgName] = await Promise.all([
    getKnownCustomers(user.organizationId),
    getOrgName(user.organizationId),
  ]);

  // Fetch all sessions for today
  const sessions = await db
    .select({
      id: schema.monitoringSessions.id,
      status: schema.monitoringSessions.status,
    })
    .from(schema.monitoringSessions)
    .where(
      and(
        eq(schema.monitoringSessions.userId, userId),
        gte(schema.monitoringSessions.startedAt, today),
        lte(schema.monitoringSessions.startedAt, tomorrow)
      )
    );

  if (sessions.length === 0) return;

  const sessionIds = sessions.map((s) => s.id);

  // ── Capture-count guard ────────────────────────────────────
  // Count current captures and compare with the last rollup.
  // If nothing changed, skip the Groq call entirely.
  const [captureCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.sessionCaptures)
    .where(
      sql`${schema.sessionCaptures.sessionId} IN (${sql.join(
        sessionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    );

  const currentCaptureCount = captureCountRow?.count ?? 0;
  if (currentCaptureCount === 0) return;

  const [existingRow] = await db
    .select({ totalCaptures: schema.userDailyActivities.totalCaptures })
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.userId, userId),
        eq(schema.userDailyActivities.activityDate, todayStr),
        eq(schema.userDailyActivities.periodType, "daily")
      )
    )
    .limit(1);

  if (existingRow && existingRow.totalCaptures === currentCaptureCount) {
    logger.debug({ userId, captures: currentCaptureCount }, "No new captures — skipping Groq call");
    return;
  }

  // ── Fetch full data (captures changed — worth re-processing) ──

  const [captures, summaries, transcripts] = await Promise.all([
    db
      .select({
        appName: schema.sessionCaptures.appName,
        windowTitle: schema.sessionCaptures.windowTitle,
        capturedAt: schema.sessionCaptures.capturedAt,
        activityDescription: schema.sessionCaptures.activityDescription,
      })
      .from(schema.sessionCaptures)
      .where(
        sql`${schema.sessionCaptures.sessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )})`
      )
      .orderBy(asc(schema.sessionCaptures.capturedAt)),
    fetchSessionSummaries(sessionIds),
    fetchSessionTranscripts(sessionIds),
  ]);

  // ── Compute deterministic metrics ──────────────────────────

  const MINUTES_PER_CAPTURE = 0.5; // each capture ≈ 30 seconds
  const totalActiveMinutes = Math.round(captures.length * MINUTES_PER_CAPTURE);

  // App breakdown: just count captures per app (no category assignment)
  const appCounts = new Map<string, number>();
  for (const capture of captures) {
    const app = capture.appName || "Unknown";
    appCounts.set(app, (appCounts.get(app) || 0) + 1);
  }

  const appBreakdown: AppBreakdownEntry[] = [...appCounts.entries()]
    .map(([app, count]) => ({
      app,
      minutes: Math.round(count * MINUTES_PER_CAPTURE),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  // ── Build capture lines for Groq ───────────────────────────
  // Each line gives the LLM: app, window title, and classifier description

  const captureLines: string[] = [];
  for (const c of captures) {
    const parts: string[] = [];
    if (c.appName) parts.push(c.appName);
    if (c.windowTitle) parts.push(`"${c.windowTitle}"`);
    if (c.activityDescription) parts.push(`— ${c.activityDescription}`);
    if (parts.length > 0) captureLines.push(parts.join(" "));
  }

  // Add session summaries and transcript snippets as extra context
  for (const s of summaries) {
    if (s.narrative) captureLines.push(`[Session summary] ${s.narrative.slice(0, 300)}`);
  }
  for (const t of transcripts) {
    if (t.transcript) captureLines.push(`[Transcript] ${t.transcript.slice(0, 200)}`);
  }

  // ── Classify activities via Groq ───────────────────────────

  const activities = await classifyActivitiesWithGroq(
    captureLines,
    totalActiveMinutes,
    knownCustomers,
    orgName
  );

  // Auto-discover new customers from Groq output
  const newSubscribers = activities.map((a) => a.subscriber).filter((s): s is string => !!s);
  addDiscoveredCustomers(user.organizationId, newSubscribers).catch((err) =>
    logger.warn({ err: String(err) }, "Failed to persist discovered customers from capture-rollup")
  );

  // Derive category breakdown from Groq's classification
  const categoryMap = new Map<string, number>();
  let totalMeetingMinutes = 0;

  for (const act of activities) {
    categoryMap.set(act.category, (categoryMap.get(act.category) || 0) + act.minutes);
    if (act.category.toLowerCase() === "meeting") {
      totalMeetingMinutes += act.minutes;
    }
  }

  const totalWorkMinutes = totalActiveMinutes - totalMeetingMinutes;

  const categoryBreakdown: CategoryBreakdownEntry[] = [...categoryMap.entries()]
    .map(([category, minutes]) => ({
      category,
      minutes,
      percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const workPercentage =
    totalActiveMinutes > 0 ? Math.round((totalWorkMinutes / totalActiveMinutes) * 100) : 0;
  const meetingPercentage =
    totalActiveMinutes > 0 ? Math.round((totalMeetingMinutes / totalActiveMinutes) * 100) : 0;

  // Derive topic breakdown from Groq's classification
  const topicMap = new Map<string, number>();
  const topicDisplayNames = new Map<string, string>();
  const subscriberMap = new Map<string, number>();
  const subscriberDisplayNames = new Map<string, string>();

  for (const act of activities) {
    if (act.topic) {
      const tKey = act.topic.toLowerCase().trim();
      topicMap.set(tKey, (topicMap.get(tKey) || 0) + act.minutes);
      const prev = topicDisplayNames.get(tKey);
      if (!prev || act.topic.length > prev.length) topicDisplayNames.set(tKey, act.topic);
    }
    if (act.subscriber) {
      const sKey = act.subscriber.toLowerCase().trim();
      subscriberMap.set(sKey, (subscriberMap.get(sKey) || 0) + act.minutes);
      const prev = subscriberDisplayNames.get(sKey);
      if (!prev || act.subscriber.length > prev.length)
        subscriberDisplayNames.set(sKey, act.subscriber);
    }
  }

  const topicBreakdown = [...topicMap.entries()]
    .map(([key, minutes]) => ({
      topicName: topicDisplayNames.get(key) || key,
      minutes: Math.round(minutes),
      percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const subscriberBreakdown = [...subscriberMap.entries()]
    .map(([key, minutes]) => ({
      subscriberName: subscriberDisplayNames.get(key) || key,
      minutes: Math.round(minutes),
      percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  // Build key accomplishments from the activity list
  const keyAccomplishments = activities.map((a) => `${a.activity} (${a.minutes}min)`);
  const daySummary = activities.length > 0 ? activities.map((a) => a.activity).join("; ") : null;

  // ── Upsert user_daily_activities ────────────────────────────
  // Reuses existingRow from the capture-count guard above.

  // Note: we do NOT set lastProcessedAt — reserved for the full Day Analyzer RLM's
  // 25-minute skip guard. Setting it here would cause the RLM to skip.
  const metricsData = {
    totalWorkMinutes,
    totalMeetingMinutes,
    totalActiveMinutes,
    totalSessions: sessions.length,
    totalCaptures: captures.length,
    workPercentage,
    meetingPercentage,
    appBreakdown: JSON.stringify(appBreakdown),
    categoryBreakdown: JSON.stringify(categoryBreakdown),
    topicBreakdown,
    subscriberBreakdown,
    daySummary,
    keyAccomplishments: JSON.stringify(keyAccomplishments),
    status: "completed" as const,
    updatedAt: new Date(),
  };

  if (existingRow) {
    await db
      .update(schema.userDailyActivities)
      .set(metricsData)
      .where(
        and(
          eq(schema.userDailyActivities.userId, userId),
          eq(schema.userDailyActivities.activityDate, todayStr),
          eq(schema.userDailyActivities.periodType, "daily")
        )
      );
  } else {
    await db.insert(schema.userDailyActivities).values({
      userId,
      organizationId: user.organizationId,
      activityDate: todayStr,
      periodType: "daily",
      ...metricsData,
    });
  }

  logger.debug(
    {
      userId,
      date: todayStr,
      captures: captures.length,
      activeMinutes: totalActiveMinutes,
      activities: activities.length,
      meetingMinutes: totalMeetingMinutes,
      topApp: appBreakdown[0]?.app,
    },
    "Wrote capture-based daily activity"
  );
}
