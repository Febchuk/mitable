/**
 * User Rollup Job (Layer 1)
 *
 * Runs every 30 minutes. For each user in the org:
 *   1. Fetches all sessions for today with classifier data, master stories, transcripts
 *   2. Feeds everything to the Day Analyzer RLM
 *   3. Writes structured activity blocks + day summary to user_daily_activities + activity_blocks
 *
 * This is the heaviest computation in the pipeline — one full RLM run per user per execution.
 */

import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import {
  dayAnalyzerRLMService,
  DayAnalyzerInput,
} from "../../services/rlm/day-analyzer-rlm.service";
import { recalculateDailyStats } from "../../services/activity-materializer.service";
import {
  DaySession,
  DayCapture,
  DayTranscript,
  DayMasterStory,
  DayAnalyzerUserProfile,
} from "../../services/rlm/day-analyzer-environment";
import { createLogger } from "../../lib/logger";
import {
  getKnownCustomers,
  getOrgName,
  addDiscoveredCustomers,
} from "../../services/known-customers.service";

const logger = createLogger({ context: "user-rollup-job" });

/**
 * Run the user rollup for all users in all orgs for a given date.
 * Called by the cron scheduler every 30 minutes (defaults to today).
 * Pass a targetDate to backfill historical days.
 */
export async function runUserRollup(
  targetDate?: Date,
  options?: { skipCompleted?: boolean }
): Promise<{
  usersProcessed: number;
  usersSkipped: number;
  usersFailed: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();
  const today = targetDate ? new Date(targetDate) : new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0]!;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const skipCompleted = options?.skipCompleted ?? false;

  logger.info({ date: todayStr }, "Starting user rollup job");

  // Find all users who have sessions on this date
  const usersWithSessions = await db
    .selectDistinct({ userId: schema.monitoringSessions.userId })
    .from(schema.monitoringSessions)
    .where(
      and(
        gte(schema.monitoringSessions.startedAt, today),
        lte(schema.monitoringSessions.startedAt, tomorrow)
      )
    );

  logger.info({ userCount: usersWithSessions.length }, "Found users with sessions on this date");

  let usersProcessed = 0;
  let usersSkipped = 0;
  let usersFailed = 0;

  for (const { userId } of usersWithSessions) {
    try {
      // Backfill dedup: skip if already completed
      if (skipCompleted) {
        const [existing] = await db
          .select({ status: schema.userDailyActivities.status })
          .from(schema.userDailyActivities)
          .where(
            and(
              eq(schema.userDailyActivities.userId, userId),
              eq(schema.userDailyActivities.activityDate, todayStr),
              eq(schema.userDailyActivities.periodType, "daily"),
              eq(schema.userDailyActivities.status, "completed")
            )
          )
          .limit(1);

        if (existing) {
          usersSkipped++;
          continue;
        }
      }

      const result = await processUserDay(userId, today, todayStr);
      if (result === "processed") {
        usersProcessed++;
      } else {
        usersSkipped++;
      }
    } catch (error) {
      usersFailed++;
      logger.error({ userId, error: String(error) }, "Failed to process user day");
    }
  }

  const totalTimeMs = Date.now() - startTime;

  logger.info(
    { usersProcessed, usersSkipped, usersFailed, totalTimeMs },
    "User rollup job completed"
  );

  return { usersProcessed, usersSkipped, usersFailed, totalTimeMs };
}

/**
 * Process a single user's day: fetch data, run RLM, write results.
 * Exported so the inactivity trigger can call it for a single user
 * after their last session ends.
 */
export async function processUserDay(
  userId: string,
  today: Date,
  todayStr: string
): Promise<"processed" | "skipped"> {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check if already processed recently (skip if processed in last 25 minutes)
  const [existing] = await db
    .select()
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.userId, userId),
        eq(schema.userDailyActivities.activityDate, todayStr),
        eq(schema.userDailyActivities.periodType, "daily")
      )
    )
    .limit(1);

  if (existing?.lastProcessedAt) {
    const minutesSinceLastProcess =
      (Date.now() - new Date(existing.lastProcessedAt).getTime()) / 60000;
    if (minutesSinceLastProcess < 25) {
      logger.debug({ userId, minutesSinceLastProcess }, "Skipping — processed recently");
      return "skipped";
    }
  }

  // Fetch user profile
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  if (!user) {
    logger.warn({ userId }, "User not found — skipping");
    return "skipped";
  }

  // Fetch all sessions for today
  const sessions = await db
    .select()
    .from(schema.monitoringSessions)
    .where(
      and(
        eq(schema.monitoringSessions.userId, userId),
        gte(schema.monitoringSessions.startedAt, today),
        lte(schema.monitoringSessions.startedAt, tomorrow)
      )
    )
    .orderBy(asc(schema.monitoringSessions.startedAt));

  if (sessions.length === 0) {
    return "skipped";
  }

  const sessionIds = sessions.map((s) => s.id);

  // Fetch captures, summaries, and transcripts for all sessions in parallel
  const [captures, summaries, transcripts] = await Promise.all([
    fetchCaptures(sessionIds),
    fetchMasterStories(sessionIds),
    fetchTranscripts(sessionIds),
  ]);

  // Build the Day Analyzer input
  const daySessions: DaySession[] = sessions.map((s) => {
    const sessionCaptures = captures.filter((c) => c.sessionId === s.id);
    const sessionTranscripts = transcripts.filter((t) => t.sessionId === s.id);
    const sessionStory = summaries.find((su) => su.sessionId === s.id);

    const durationMs = s.endedAt
      ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() - (s.totalPausedMs || 0)
      : Date.now() - new Date(s.startedAt).getTime() - (s.totalPausedMs || 0);

    return {
      sessionId: s.id,
      startedAt: new Date(s.startedAt),
      endedAt: s.endedAt ? new Date(s.endedAt) : null,
      durationMinutes: Math.round(durationMs / 60000),
      name: s.name,
      sessionGoal: s.sessionGoal,
      linearIssueTitle: s.linearIssueTitle,
      captureCount: sessionCaptures.length,
      hasTranscripts: sessionTranscripts.length > 0,
      hasMasterStory: !!sessionStory,
    };
  });

  const dayCaptures: DayCapture[] = captures.map((c) => ({
    id: c.id,
    sessionId: c.sessionId,
    capturedAt: new Date(c.capturedAt),
    appName: c.appName,
    windowTitle: c.windowTitle,
    activityDescription: c.activityDescription,
    classifierData: c.classifierData as DayCapture["classifierData"],
    deltaChanged: c.deltaChanged ?? false,
    deltaChangeType: c.deltaChangeType,
    importanceScore: c.importanceScore ?? 0,
  }));

  const dayTranscripts: DayTranscript[] = transcripts.map((t) => ({
    sessionId: t.sessionId,
    speakerId: t.speakerId,
    transcript: t.transcript,
    startTime: new Date(t.startTime),
    endTime: new Date(t.endTime),
    confidence: t.confidence,
  }));

  const dayMasterStories: DayMasterStory[] = summaries.map((s) => ({
    sessionId: s.sessionId,
    narrativeSummary: s.narrativeSummary,
    generationTimeMs: s.generationTimeMs,
  }));

  const userProfile: DayAnalyzerUserProfile = {
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    regularTasks: (user.regularTasks as string[]) || [],
    regularApps: (user.regularApps as string[]) || [],
  };

  // Fetch known customers and org name for customer-first classification
  const [knownCustomers, orgName] = await Promise.all([
    getKnownCustomers(user.organizationId),
    getOrgName(user.organizationId),
  ]);

  const input: DayAnalyzerInput = {
    date: today,
    userProfile,
    sessions: daySessions,
    captures: dayCaptures,
    transcripts: dayTranscripts,
    masterStories: dayMasterStories,
    knownCustomers,
    orgName,
  };

  // Mark as processing
  const dailyActivityId = existing?.id || undefined;

  if (dailyActivityId) {
    await db
      .update(schema.userDailyActivities)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(schema.userDailyActivities.id, dailyActivityId));
  }

  // Run the Day Analyzer RLM
  logger.info(
    {
      userId,
      sessionCount: daySessions.length,
      captureCount: dayCaptures.length,
      transcriptCount: dayTranscripts.length,
      storyCount: dayMasterStories.length,
    },
    "Running Day Analyzer RLM"
  );

  const result = await dayAnalyzerRLMService.analyzeDay(input);

  // Write results to database
  await writeResults(
    userId,
    user.organizationId,
    todayStr,
    dailyActivityId,
    result,
    sessions.length,
    captures.length,
    knownCustomers
  );

  // Auto-discover customers from Day Analyzer output
  const subscribers = result.blocks.map((b) => b.subscriberName).filter((s): s is string => !!s);
  addDiscoveredCustomers(user.organizationId, subscribers).catch((err) =>
    logger.warn({ err: String(err) }, "Failed to persist discovered customers")
  );

  return "processed";
}

/**
 * Fetch captures for multiple sessions (batched)
 */
async function fetchCaptures(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];

  return db
    .select({
      id: schema.sessionCaptures.id,
      sessionId: schema.sessionCaptures.sessionId,
      capturedAt: schema.sessionCaptures.capturedAt,
      appName: schema.sessionCaptures.appName,
      windowTitle: schema.sessionCaptures.windowTitle,
      activityDescription: schema.sessionCaptures.activityDescription,
      classifierData: schema.sessionCaptures.classifierData,
      deltaChanged: schema.sessionCaptures.deltaChanged,
      deltaChangeType: schema.sessionCaptures.deltaChangeType,
      importanceScore: schema.sessionCaptures.importanceScore,
    })
    .from(schema.sessionCaptures)
    .where(
      sql`${schema.sessionCaptures.sessionId} IN (${sql.join(
        sessionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    )
    .orderBy(asc(schema.sessionCaptures.capturedAt));
}

/**
 * Fetch master stories for multiple sessions
 */
async function fetchMasterStories(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];

  return db
    .select({
      sessionId: schema.sessionSummaries.sessionId,
      narrativeSummary: schema.sessionSummaries.narrativeSummary,
      generationTimeMs: schema.sessionSummaries.generationTimeMs,
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
 * Fetch transcripts for multiple sessions
 */
async function fetchTranscripts(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];

  return db
    .select({
      sessionId: schema.sessionTranscripts.sessionId,
      speakerId: schema.sessionTranscripts.speakerId,
      transcript: schema.sessionTranscripts.transcript,
      startTime: schema.sessionTranscripts.startTime,
      endTime: schema.sessionTranscripts.endTime,
      confidence: schema.sessionTranscripts.confidence,
    })
    .from(schema.sessionTranscripts)
    .where(
      sql`${schema.sessionTranscripts.sessionId} IN (${sql.join(
        sessionIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    )
    .orderBy(asc(schema.sessionTranscripts.startTime));
}

/**
 * Write Day Analyzer results to the database (upsert daily activity + replace blocks)
 */
async function writeResults(
  userId: string,
  organizationId: string,
  todayStr: string,
  existingId: string | undefined,
  result: Awaited<ReturnType<typeof dayAnalyzerRLMService.analyzeDay>>,
  totalSessions: number,
  totalCaptures: number,
  knownCustomers: string[] = []
): Promise<void> {
  await db.transaction(async (tx) => {
    // Upsert user_daily_activities
    let dailyActivityId: string;

    if (existingId) {
      // Update existing
      await tx
        .update(schema.userDailyActivities)
        .set({
          totalWorkMinutes: result.totalWorkMinutes,
          totalMeetingMinutes: result.totalMeetingMinutes,
          totalActiveMinutes: result.totalActiveMinutes,
          totalSessions,
          totalCaptures,
          workPercentage: result.workPercentage,
          meetingPercentage: result.meetingPercentage,
          appBreakdown: JSON.stringify(result.appBreakdown),
          categoryBreakdown: JSON.stringify(result.categoryBreakdown),
          daySummary: result.daySummary,
          keyAccomplishments: JSON.stringify(result.keyAccomplishments),
          status: "completed",
          modelUsed: result.modelUsed,
          processingTimeMs: result.executionTimeMs,
          lastProcessedAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.userDailyActivities.id, existingId));

      dailyActivityId = existingId;

      // Delete old blocks for this day (will be replaced)
      await tx
        .delete(schema.activityBlocks)
        .where(eq(schema.activityBlocks.dailyActivityId, existingId));
    } else {
      // Insert new
      const [inserted] = await tx
        .insert(schema.userDailyActivities)
        .values({
          userId,
          organizationId,
          activityDate: todayStr,
          periodType: "daily",
          totalWorkMinutes: result.totalWorkMinutes,
          totalMeetingMinutes: result.totalMeetingMinutes,
          totalActiveMinutes: result.totalActiveMinutes,
          totalSessions,
          totalCaptures,
          workPercentage: result.workPercentage,
          meetingPercentage: result.meetingPercentage,
          appBreakdown: JSON.stringify(result.appBreakdown),
          categoryBreakdown: JSON.stringify(result.categoryBreakdown),
          daySummary: result.daySummary,
          keyAccomplishments: JSON.stringify(result.keyAccomplishments),
          status: "completed",
          modelUsed: result.modelUsed,
          processingTimeMs: result.executionTimeMs,
          lastProcessedAt: new Date(),
        })
        .returning({ id: schema.userDailyActivities.id });

      dailyActivityId = inserted!.id;
    }

    // Insert activity blocks (infer subscriber from topic/name when missing)
    if (result.blocks.length > 0) {
      await tx.insert(schema.activityBlocks).values(
        result.blocks.map((block, index) => {
          let subscriber = block.subscriberName || null;
          if (!subscriber && knownCustomers.length > 0) {
            const text = `${block.topicName || ""} ${block.name}`.toLowerCase();
            const matched = knownCustomers.find((c) => text.includes(c.toLowerCase()));
            if (matched) subscriber = matched;
          }
          return {
            dailyActivityId,
            userId,
            blockType: block.type,
            name: block.name,
            startTime: block.startTime,
            endTime: block.endTime,
            durationMinutes: block.durationMinutes,
            description: block.description,
            apps: JSON.stringify(block.apps),
            category: block.category,
            topicName: block.topicName || null,
            subscriberName: subscriber,
            participants: block.participants ? JSON.stringify(block.participants) : "[]",
            sourceSessionIds: JSON.stringify(block.sourceSessionIds),
            sequenceNumber: index,
          };
        })
      );
    }

    // Recalculate daily aggregates (categoryBreakdown, topicBreakdown, subscriberBreakdown)
    // from the freshly-inserted blocks — single source of truth
    await recalculateDailyStats(dailyActivityId, tx, knownCustomers);
  });

  logger.info(
    {
      userId,
      date: todayStr,
      blockCount: result.blocks.length,
      totalActiveMinutes: result.totalActiveMinutes,
    },
    "Wrote daily activity results to DB"
  );
}
