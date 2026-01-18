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
 * Key changes from v1:
 * - Consumes `activityDescription` from `session_captures` (Classifier Output).
 * - Triggered ON DEMAND at session end (via `generateStory`), not incrementally.
 */

import Groq from "groq-sdk";
import { config } from "../config";
import { db } from "../db/client";
import { sessionCaptures, sessionSummaries } from "../db/schema/index";
import { eq, desc, and, isNotNull, asc } from "drizzle-orm";
import { STORYTELLER_SYSTEM_PROMPT } from "../prompts/session-prompts";
import { createSessionLogger, createTimer, CHECKPOINTS } from "../lib/sessionLogger";

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
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Generate the Master Story from the Activity Timeline
   */
  async generateStory(options: GenerateStoryOptions): Promise<string> {
    const log = createSessionLogger({ sessionId: options.sessionId });
    const timer = createTimer("MasterStory.generateStory");

    log.info("Starting Master Story generation", { options });

    try {
      // 1. Fetch Activity Timeline (Classifier Output)
      const activities = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, options.sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [asc(sessionCaptures.sequenceNumber)],
        columns: {
          activityDescription: true,
          capturedAt: true,
        },
      });

      if (activities.length === 0) {
        log.warn("No activities found for story generation");
        return "No activity recorded in this session.";
      }

      // 2. Format Timeline for Prompt
      const timelineText = activities
        .map((a, i) => `${i + 1}. [${a.capturedAt.toISOString()}] ${a.activityDescription}`)
        .join("\n");

      // 3. Build Prompt
      const userPrompt = `
TIMELINE:
${timelineText}

PREFERENCES:
Style: ${options.formatPreference.style}
Format: ${options.formatPreference.format}

Generate the Master Story update:`;

      // 4. Call LLM (Llama 3 70b or 8b)
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: STORYTELLER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        model: "llama3-70b-8192", // High capacity for summarization
        temperature: 0.2,
      });

      const story = completion.choices[0]?.message?.content || "Failed to generate story.";

      // 5. Save Summary to DB
      await db.insert(sessionSummaries).values({
        sessionId: options.sessionId,
        version: 1, // Reset versioning for this new flow
        summaryType: "master_story", // or 'final_summary'
        narrativeSummary: story,
        modelUsed: "llama3-70b-8192",
        tokenCount: completion.usage?.total_tokens || 0,
        generationTimeMs: timer.elapsed(),
      });

      log.checkpoint(CHECKPOINTS.SUMMARY_SAVE, {
        length: story.length,
        durationMs: timer.elapsed(),
      });

      return story;

    } catch (error) {
      log.error("Failed to generate master story", {
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
