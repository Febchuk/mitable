/**
 * Block Analyzer Orchestrator
 *
 * Top-level function called at session end. Fetches all session data,
 * runs the Block Analyzer RLM, and materializes the results.
 *
 * Replaces the old classifySession → materializeSession chain.
 *
 * Usage: await runBlockAnalyzer(sessionId)
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, asc, desc, and, isNotNull, gte } from "drizzle-orm";
import { createLogger } from "../domains/shared-infra/lib/logger.js";
import { blockAnalyzerRLMService } from "./rlm/block-analyzer-rlm.service";
import { materializeBlockAnalyzerResult } from "./block-analyzer-materializer.service";
import { getKnownCustomers, getOrgName } from "./known-customers.service";
import type {
  SessionMeta,
  SessionCapture,
  SessionTranscript,
  SessionMasterStory,
  BlockAnalyzerUserProfile,
  SubscriberHistoryEntry,
} from "./rlm/block-analyzer-environment";

const logger = createLogger({ context: "block-analyzer-orchestrator" });

/**
 * Run the full Block Analyzer pipeline for a session:
 *   1. Fetch session + user + captures + transcripts + master story
 *   2. Run the Block Analyzer RLM (Claude → OpenAI → DeepSeek)
 *   3. Materialize results into activity_blocks + user_daily_activities
 *   4. Fire-and-forget graph sync + customer discovery
 */
export async function runBlockAnalyzer(sessionId: string): Promise<void> {
  const startMs = Date.now();

  try {
    if (!blockAnalyzerRLMService.isAvailable()) {
      throw new Error("Block Analyzer RLM not available — no LLM configured");
    }

    // 1. Fetch session metadata
    const [session] = await db
      .select({
        id: schema.monitoringSessions.id,
        userId: schema.monitoringSessions.userId,
        organizationId: schema.monitoringSessions.organizationId,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        totalPausedMs: schema.monitoringSessions.totalPausedMs,
        name: schema.monitoringSessions.name,
        sessionGoal: schema.monitoringSessions.sessionGoal,
        linearIssueTitle: schema.monitoringSessions.linearIssueTitle,
        finalSummary: schema.monitoringSessions.finalSummary,
        rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
      })
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`Session ${sessionId} not found for block analysis`);
    }

    const sessionStartMs = new Date(session.startedAt).getTime();
    const sessionEndMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    const activeMs = Math.max(0, sessionEndMs - sessionStartMs - (session.totalPausedMs || 0));
    const durationMinutes = Math.max(1, Math.round(activeMs / 60000));

    // Skip very short sessions (< 2 minutes active)
    if (durationMinutes < 2) {
      logger.info(
        { sessionId, durationMinutes },
        "Session too short for block analysis — skipping"
      );
      return;
    }

    // 2. Fetch user profile
    const [user] = await db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        jobTitle: schema.users.jobTitle,
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    const userProfile: BlockAnalyzerUserProfile = {
      userId: session.userId,
      firstName: user?.firstName || null,
      lastName: user?.lastName || null,
      jobTitle: user?.jobTitle || null,
    };

    // 3. Fetch captures
    const rawCaptures = await db
      .select({
        id: schema.sessionCaptures.id,
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
      .where(eq(schema.sessionCaptures.sessionId, sessionId))
      .orderBy(asc(schema.sessionCaptures.capturedAt));

    if (rawCaptures.length === 0) {
      logger.info({ sessionId }, "No captures — skipping block analysis");
      return;
    }

    const captures: SessionCapture[] = rawCaptures.map((c) => ({
      id: c.id,
      capturedAt: new Date(c.capturedAt),
      appName: c.appName,
      windowTitle: c.windowTitle,
      activityDescription: c.activityDescription,
      classifierData: c.classifierData as SessionCapture["classifierData"],
      deltaChanged: c.deltaChanged ?? false,
      deltaChangeType: c.deltaChangeType,
      importanceScore: c.importanceScore ?? 0,
    }));

    // 4. Fetch transcripts
    const rawTranscripts = await db
      .select({
        speakerId: schema.sessionTranscripts.speakerId,
        transcript: schema.sessionTranscripts.transcript,
        startTime: schema.sessionTranscripts.startTime,
        endTime: schema.sessionTranscripts.endTime,
        confidence: schema.sessionTranscripts.confidence,
      })
      .from(schema.sessionTranscripts)
      .where(eq(schema.sessionTranscripts.sessionId, sessionId))
      .orderBy(asc(schema.sessionTranscripts.startTime));

    const transcripts: SessionTranscript[] = rawTranscripts.map((t) => ({
      speakerId: t.speakerId,
      transcript: t.transcript,
      startTime: new Date(t.startTime),
      endTime: new Date(t.endTime),
      confidence: t.confidence ?? 0,
    }));

    // 5. Fetch master story — prefer the versioned master_story from
    //    session_summaries, fall back to finalSummary on the session record
    const [rawStory] = await db
      .select({
        narrativeSummary: schema.sessionSummaries.narrativeSummary,
        generationTimeMs: schema.sessionSummaries.generationTimeMs,
      })
      .from(schema.sessionSummaries)
      .where(
        and(
          eq(schema.sessionSummaries.sessionId, sessionId),
          eq(schema.sessionSummaries.summaryType, "master_story")
        )
      )
      .orderBy(desc(schema.sessionSummaries.createdAt))
      .limit(1);

    let masterStory: SessionMasterStory | null = null;
    if (rawStory?.narrativeSummary) {
      masterStory = {
        narrativeSummary: rawStory.narrativeSummary,
        generationTimeMs: rawStory.generationTimeMs,
      };
    } else if (session.finalSummary) {
      // Fallback: use the finalSummary stored directly on the session
      masterStory = {
        narrativeSummary: session.finalSummary,
        generationTimeMs: null,
      };
    } else if (session.rawActivitySummary) {
      // Last resort: use the raw activity summary
      masterStory = {
        narrativeSummary: session.rawActivitySummary,
        generationTimeMs: null,
      };
    }

    // 6. Fetch known customers + org name
    const [knownCustomers, orgName] = await Promise.all([
      getKnownCustomers(session.organizationId),
      getOrgName(session.organizationId),
    ]);

    // 6b. Pre-fetch subscriber history for this user (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentBlocks = await db
      .select({
        subscriberName: schema.activityBlocks.subscriberName,
        topicName: schema.activityBlocks.topicName,
        apps: schema.activityBlocks.apps,
        durationMinutes: schema.activityBlocks.durationMinutes,
        startTime: schema.activityBlocks.startTime,
      })
      .from(schema.activityBlocks)
      .where(
        and(
          eq(schema.activityBlocks.userId, session.userId),
          isNotNull(schema.activityBlocks.subscriberName),
          gte(schema.activityBlocks.startTime, ninetyDaysAgo)
        )
      );

    const historyMap = new Map<
      string,
      { minutes: number; blocks: number; topics: Set<string>; apps: Set<string>; lastSeen: string }
    >();
    for (const b of recentBlocks) {
      if (!b.subscriberName) continue;
      const existing = historyMap.get(b.subscriberName) || {
        minutes: 0,
        blocks: 0,
        topics: new Set<string>(),
        apps: new Set<string>(),
        lastSeen: "",
      };
      existing.minutes += b.durationMinutes;
      existing.blocks += 1;
      if (b.topicName) existing.topics.add(b.topicName);
      if (Array.isArray(b.apps)) {
        for (const app of b.apps) {
          if (typeof app === "string") existing.apps.add(app);
        }
      }
      const dateStr = new Date(b.startTime).toISOString().split("T")[0]!;
      if (dateStr > existing.lastSeen) existing.lastSeen = dateStr;
      historyMap.set(b.subscriberName, existing);
    }

    const subscriberHistory: SubscriberHistoryEntry[] = [...historyMap.entries()]
      .map(([name, data]) => ({
        subscriberName: name,
        totalMinutes: data.minutes,
        blockCount: data.blocks,
        recentTopics: [...data.topics].slice(0, 10),
        recentApps: [...data.apps].slice(0, 10),
        lastSeenDate: data.lastSeen,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // 7. Build session meta
    const sessionMeta: SessionMeta = {
      sessionId,
      startedAt: new Date(session.startedAt),
      endedAt: session.endedAt ? new Date(session.endedAt) : null,
      durationMinutes,
      name: session.name,
      sessionGoal: session.sessionGoal,
      linearIssueTitle: session.linearIssueTitle,
      captureCount: captures.length,
      hasTranscripts: transcripts.length > 0,
      hasMasterStory: !!masterStory,
    };

    logger.info(
      {
        sessionId,
        userId: session.userId,
        durationMinutes,
        captureCount: captures.length,
        transcriptCount: transcripts.length,
        hasMasterStory: !!masterStory,
        knownCustomerCount: knownCustomers.length,
      },
      "Running Block Analyzer RLM"
    );

    // 8. Run the Block Analyzer RLM
    const result = await blockAnalyzerRLMService.analyzeSession({
      session: sessionMeta,
      userProfile,
      captures,
      transcripts,
      masterStory,
      knownCustomers,
      orgName,
      subscriberHistory,
    });

    // 9. Materialize results
    await materializeBlockAnalyzerResult(
      sessionId,
      session.userId,
      session.organizationId,
      new Date(session.startedAt),
      result
    );

    // 10. Also write keyActivities to the session record (backward compat)
    const keyActivities = result.blocks.map((b) => ({
      activity: b.name,
      category: b.category,
      minutes: b.durationMinutes,
      description: b.description,
      topic: b.topicName || undefined,
      subscriber: b.subscriberName || undefined,
    }));

    await db
      .update(schema.monitoringSessions)
      .set({ keyActivities })
      .where(eq(schema.monitoringSessions.id, sessionId));

    const elapsed = Date.now() - startMs;
    logger.info(
      {
        sessionId,
        blockCount: result.blocks.length,
        toolCalls: result.toolCallCount,
        modelUsed: result.modelUsed,
        totalElapsedMs: elapsed,
        rlmTimeMs: result.executionTimeMs,
      },
      "Block Analyzer pipeline completed"
    );
  } catch (error) {
    logger.error(
      {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Block Analyzer pipeline failed"
    );
    throw error;
  }
}
