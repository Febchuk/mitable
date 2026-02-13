/**
 * Master Story Service
 *
 * Implements the "Storyteller" (Step 3) of the Screen Understanding Pipeline.
 *
 * Responsibility:
 * - Generate a final narrative summary from the categorized Activity Timeline.
 * - Applies the "Materiality Filter" (summarizing 10 small actions into 1 meaningful update).
 * - Respects user formatting preferences (Verbose/Concise, Bullets/Paragraphs).
 *
 * Key changes from v2 (RLM Architecture):
 * - Uses Storyteller mini-RLM for recursive summarization
 * - RLM handles chunking and merging for large timelines
 * - Tool-based approach (no arbitrary code execution)
 */

import { db } from "../db/client";
import {
  monitoringSessions,
  sessionCaptures,
  sessionTranscripts,
  sessionSummaries,
} from "../db/schema";
import { eq, and, isNotNull, asc, desc } from "drizzle-orm";
import { createSessionLogger, createTimer, CHECKPOINTS } from "../lib/sessionLogger";
import { storytellerRLMService } from "./rlm/storyteller-rlm.service";

export interface GenerateStoryOptions {
  sessionId: string;
  userId: string;
  formatPreference: {
    style: "verbose" | "concise";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  };
}

class MasterStoryService {
  /**
   * Generate the Master Story from the Activity Timeline using RLM
   */
  async generateStory(options: GenerateStoryOptions): Promise<string> {
    const log = createSessionLogger({ sessionId: options.sessionId });
    const timer = createTimer("MasterStory.generateStory");

    log.info("Starting Master Story generation (RLM)", { options });

    try {
      // 1. Fetch Activity Timeline (Classifier Output) - already ordered chronologically by sequenceNumber
      const rawActivities = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, options.sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [asc(sessionCaptures.sequenceNumber)],
        columns: {
          activityDescription: true,
          capturedAt: true,
          sequenceNumber: true,
          classifierData: true, // Rich structured output from Classifier RLM
        },
      });

      // Filter out nulls and map to format needed by RLM
      const timeline = rawActivities
        .filter(
          (
            a
          ): a is {
            activityDescription: string;
            capturedAt: Date;
            sequenceNumber: number;
            classifierData: any;
          } => a.activityDescription !== null
        )
        .map((a) => ({
          activityDescription: a.activityDescription!,
          capturedAt: a.capturedAt,
          classifierData: a.classifierData
            ? typeof a.classifierData === "string"
              ? JSON.parse(a.classifierData)
              : a.classifierData
            : undefined,
        }));

      if (timeline.length === 0) {
        log.warn("No activities found for story generation");
        return "No activity recorded in this session.";
      }

      // 2. Fetch ALL audio transcripts for rich narrative context
      const transcripts = await db.query.sessionTranscripts.findMany({
        where: eq(sessionTranscripts.sessionId, options.sessionId),
        orderBy: [asc(sessionTranscripts.startTime)],
        columns: {
          speakerId: true,
          transcript: true,
          startTime: true,
          endTime: true,
          confidence: true,
        },
      });

      // Build full transcript text for storyteller
      const fullTranscriptText =
        transcripts.length > 0
          ? transcripts
              .map((t) => {
                const time = new Date(t.startTime).toLocaleTimeString();
                return `[${time}] Speaker ${t.speakerId}: ${t.transcript}`;
              })
              .join("\n")
          : undefined;

      if (fullTranscriptText) {
        log.info("Audio transcripts available for storyteller", {
          transcriptCount: transcripts.length,
          totalCharacters: fullTranscriptText.length,
        });
      }

      // 3. Calculate session metadata
      const sessionStart = timeline[0]?.capturedAt;
      const sessionEnd = timeline[timeline.length - 1]?.capturedAt;
      const durationMinutes =
        sessionStart && sessionEnd
          ? Math.round((sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60))
          : 0;

      const metadata = {
        sessionId: options.sessionId,
        totalActivities: timeline.length,
        durationMinutes,
        startTime: sessionStart || new Date(),
        endTime: sessionEnd || new Date(),
      };

      log.debug("Invoking Storyteller RLM", {
        activityCount: timeline.length,
        transcriptCount: transcripts.length,
        durationMinutes,
        style: options.formatPreference.style,
        format: options.formatPreference.format,
      });

      // 4a. Update progress: applying_preferences
      await db
        .update(monitoringSessions)
        .set({ summarizationProgress: "applying_preferences" })
        .where(eq(monitoringSessions.id, options.sessionId));

      // 4b. Update progress: writing_summary (RLM is now generating)
      await db
        .update(monitoringSessions)
        .set({ summarizationProgress: "writing_summary" })
        .where(eq(monitoringSessions.id, options.sessionId));

      const rlmResult = await storytellerRLMService.generateSummary({
        sessionId: options.sessionId,
        timeline,
        fullTranscriptText, // Full audio context for rich narrative
        metadata,
        preferences: options.formatPreference,
      });

      log.info("Storyteller RLM completed", {
        toolCalls: rlmResult.toolCallCount,
        recursionDepth: rlmResult.recursionDepth,
        executionTimeMs: rlmResult.executionTimeMs,
        summaryLength: rlmResult.summary.length,
      });

      // 5. Update progress: finalizing
      await db
        .update(monitoringSessions)
        .set({ summarizationProgress: "finalizing" })
        .where(eq(monitoringSessions.id, options.sessionId));

      // 6. Save Summary to DB
      await db.insert(sessionSummaries).values({
        sessionId: options.sessionId,
        version: 2, // v2 = RLM architecture
        summaryType: "master_story", // Keep same type for UI compatibility
        narrativeSummary: rlmResult.summary,
        modelUsed: "openai/gpt-oss-120b",
        tokenCount: 0, // RLM uses multiple calls, tracking separately
        generationTimeMs: timer.elapsed(),
      });

      log.checkpoint(CHECKPOINTS.SUMMARY_SAVE, {
        length: rlmResult.summary.length,
        durationMs: timer.elapsed(),
        rlmToolCalls: rlmResult.toolCallCount,
        rlmRecursionDepth: rlmResult.recursionDepth,
      });

      return rlmResult.summary;
    } catch (error) {
      log.error("Failed to generate master story (RLM)", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the latest generated story (for UI display)
   */
  async getCurrentStory(sessionId: string): Promise<string | null> {
    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.summaryType, "master_story")
      ),
      orderBy: desc(sessionSummaries.createdAt),
    });

    return summary?.narrativeSummary || null;
  }

  /**
   * Get metadata about the generated story
   */
  async getStoryMetadata(sessionId: string): Promise<{
    version: number;
    length: number;
    lastUpdated: Date | null;
    totalTokens: number;
  } | null> {
    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.summaryType, "master_story")
      ),
      orderBy: desc(sessionSummaries.createdAt),
    });

    if (!summary) return null;

    return {
      version: summary.version,
      length: summary.narrativeSummary?.length || 0,
      lastUpdated: summary.createdAt,
      totalTokens: summary.tokenCount || 0,
    };
  }
}

export const masterStoryService = new MasterStoryService();
