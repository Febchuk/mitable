/**
 * Session Title Generation Service
 *
 * Generates concise, descriptive session titles from activity timeline data.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config";
import { db } from "../db/client";
import { sessionCaptures } from "../db/schema/index";
import { eq, and, isNotNull, asc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "session-title" });

const SYSTEM_PROMPT = `<role>
You are an expert at creating concise, descriptive titles for work sessions.
</role>

<task>
Given a timeline of activities from a user's work session, generate a short, descriptive title that captures what they worked on.
</task>

<rules>
1. Keep titles under 6 words
2. Use active language (e.g., "Debugging auth flow", "Writing API docs")
3. Focus on the primary work done, not every detail
4. Be specific but concise
5. Do NOT use generic titles like "Work Session" or "Productive Day"
6. If multiple distinct tasks, choose the most significant or time-consuming one
7. Do NOT include time references or dates
</rules>

<examples>
Activities: "Opened VSCode, edited auth.ts, fixed login bug, tested login flow"
Title: "Fixed authentication bug"

Activities: "Opened Figma, designed dashboard mockup, adjusted colors"
Title: "Designed dashboard mockup"

Activities: "Reviewed PRs on GitHub, commented on 3 pull requests"
Title: "Code review session"

Activities: "Read React docs, implemented useEffect hook, tested component"
Title: "Built React component"
</examples>

<output_format>
Return ONLY the title text, nothing else. No quotes, no punctuation at the end.
</output_format>`;

class SessionTitleService {
  private anthropic: Anthropic | null = null;
  private deepseek: OpenAI | null = null;

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
    }
    if (!this.anthropic && !this.deepseek) {
      logger.warn(
        "No LLM configured for title generation (need ANTHROPIC_API_KEY or DEEPSEEK_API_KEY)"
      );
    }
  }

  /**
   * Generate a title for a session based on its activity timeline
   * Uses the full activity timeline (same as master story service) for comprehensive context
   */
  async generateTitle(sessionId: string): Promise<string> {
    try {
      logger.info(`Generating title for session ${sessionId}`);

      // 1. Fetch Activity Timeline (Classifier Output) - same approach as master story service
      const activities = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [asc(sessionCaptures.sequenceNumber)],
        columns: {
          activityDescription: true,
          capturedAt: true,
        },
      });

      if (activities.length === 0) {
        logger.warn(`No activities found for session ${sessionId}, using default title`);
        return "Work session";
      }

      // 2. Build activity timeline summary from ALL activities
      // Filter out any null descriptions (shouldn't happen due to isNotNull, but TypeScript safety)
      const validActivities = activities.filter(
        (a): a is { activityDescription: string; capturedAt: Date } =>
          a.activityDescription !== null
      );

      // Cap activities to prevent prompt overflow on large sessions (60-100+ captures)
      const MAX_ACTIVITIES = 30;
      let cappedActivities = validActivities;
      if (validActivities.length > MAX_ACTIVITIES) {
        // Take first 20 + last 10 for representative sample
        cappedActivities = [
          ...validActivities.slice(0, 20),
          ...validActivities.slice(-10),
        ];
      }

      const activitySummary = this.buildActivitySummary(cappedActivities);

      // 3. Generate title using AI (Claude primary, DeepSeek fallback)
      const title = await this.callLLM(activitySummary);

      if (!title || title.length === 0) {
        logger.warn(`AI returned empty title for session ${sessionId}`);
        return "Work session";
      }

      logger.info(
        {
          sessionId,
          title,
          activityCount: validActivities.length,
        },
        `Generated title for session ${sessionId}: "${title}"`
      );
      return title;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
        `Failed to generate title for session ${sessionId}`
      );
      return "Work session"; // Fallback to default
    }
  }

  /**
   * Call LLM for title generation.
   * Claude Sonnet 4.5 (primary, no extended thinking needed for titles).
   * DeepSeek chat (fallback).
   */
  private async callLLM(activitySummary: string): Promise<string> {
    // Try Claude first
    if (this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 50,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: activitySummary }],
        });

        for (const block of response.content) {
          if (block.type === "text") {
            logger.info("✅ Title generated via Claude Sonnet 4.5");
            return block.text.trim();
          }
        }
        throw new Error("No text block in Claude response");
      } catch (error) {
        logger.warn(`Claude title generation failed, falling back to DeepSeek: ${String(error)}`);
      }
    }

    // DeepSeek fallback
    if (this.deepseek) {
      const completion = await this.deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: activitySummary },
        ],
        temperature: 0.7,
        max_tokens: 50,
      });

      const title = completion.choices[0]?.message?.content?.trim();
      if (title) {
        logger.info("⚠️ Title generated via DeepSeek (fallback)");
        return title;
      }
    }

    throw new Error("No LLM available for title generation");
  }

  /**
   * Build activity timeline summary from all activities
   * Uses the same format as master story service for consistency
   */
  private buildActivitySummary(
    activities: Array<{
      activityDescription: string;
      capturedAt: Date;
    }>
  ): string {
    // Format timeline - same approach as master story service
    const timelineText = activities
      .map((a, i) => `${i + 1}. [${a.capturedAt.toISOString()}] ${a.activityDescription}`)
      .join("\n");

    return `ACTIVITY TIMELINE:\n${timelineText}\n\nGenerate a concise title for this work session:`;
  }
}

export const sessionTitleService = new SessionTitleService();
