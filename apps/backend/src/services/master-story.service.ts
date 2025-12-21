/**
 * Master Story Service
 *
 * Builds and maintains the "living document" narrative for a session.
 * Only extends the story when progression is detected (meaningful actions).
 *
 * Key features:
 * - Continuous narrative building using Storyteller prompt
 * - Stored in session_summaries table for persistence
 * - User context injection (role, team, watched windows)
 * - Versioned updates for crash recovery
 */

import Groq from "groq-sdk";
import { config } from "../config";
import { db } from "../db/client";
import { sessionSummaries, users } from "../db/schema/index";
import { eq, desc, and } from "drizzle-orm";
import {
  buildStorytellerPrompt,
  parseStorytellerResponse,
  GoalContext,
} from "../prompts/session-prompts";
import { FrameAnalysisResult } from "./frame-analysis.service";
import { withRetry } from "../utils/retry";

// Configuration
const STORY_CONFIG = {
  MODEL: "llama-3.1-8b-instant", // Fast and cheap for text generation
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.5, // Slightly creative for narrative writing
  MAX_STORY_LENGTH: 50000, // Truncate if story gets too long
};

// Types
export interface StoryContext {
  sessionId: string;
  userId: string;
  frameAnalysis: FrameAnalysisResult;
  windowInfo: {
    appName: string;
    windowTitle: string;
  };
  // Optional goal context for enhanced storytelling
  goalContext?: GoalContext;
}

export interface StoryUpdateResult {
  success: boolean;
  version: number;
  storyLength: number;
  tokensUsed: number;
  latencyMs: number;
  error?: string;
}

class MasterStoryService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Extend the master story with a new progression
   * Only call this when progression_detected === true
   */
  async extendStory(context: StoryContext): Promise<StoryUpdateResult> {
    const startTime = Date.now();

    try {
      // Get current story from database
      const currentSummary = await db.query.sessionSummaries.findFirst({
        where: and(
          eq(sessionSummaries.sessionId, context.sessionId),
          eq(sessionSummaries.summaryType, "master_story")
        ),
        orderBy: desc(sessionSummaries.version),
      });

      const currentStory = currentSummary?.narrativeSummary || "";
      const currentVersion = currentSummary?.version || 0;

      // Get user context for the prompt
      const userContext = await this.getUserContext(context.userId);

      // Build the storyteller prompt with goal context if available
      const { system, user } = buildStorytellerPrompt({
        userRole: userContext.role,
        userSeniority: userContext.seniority,
        workContext: userContext.workContext,
        appName: context.windowInfo.appName,
        windowTitle: context.windowInfo.windowTitle,
        currentStory: this.truncateStory(currentStory),
        latestAction: context.frameAnalysis.summaryOfAction,
        goalContext: context.goalContext,
      });

      // Generate updated story
      const response = await withRetry(
        async () => {
          return await this.groq.chat.completions.create({
            model: STORY_CONFIG.MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: STORY_CONFIG.MAX_TOKENS,
            temperature: STORY_CONFIG.TEMPERATURE,
          });
        },
        "MasterStory.extendStory",
        { maxRetries: 2 }
      );

      const rawStory = response.choices[0]?.message?.content || "";
      const updatedStory = parseStorytellerResponse(rawStory);

      if (!updatedStory || updatedStory.length === 0) {
        throw new Error("Empty story generated");
      }

      // Save to database
      const newVersion = currentVersion + 1;
      await db.insert(sessionSummaries).values({
        sessionId: context.sessionId,
        version: newVersion,
        summaryType: "master_story",
        narrativeSummary: updatedStory,
        modelUsed: STORY_CONFIG.MODEL,
        tokenCount: response.usage?.total_tokens || 0,
        generationTimeMs: Date.now() - startTime,
      });

      console.log(
        `[MasterStory] Updated story for session ${context.sessionId} ` +
          `(v${newVersion}, ${updatedStory.length} chars)`
      );

      return {
        success: true,
        version: newVersion,
        storyLength: updatedStory.length,
        tokensUsed: response.usage?.total_tokens || 0,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error(
        `[MasterStory] Failed to extend story for session ${context.sessionId}:`,
        error
      );

      return {
        success: false,
        version: 0,
        storyLength: 0,
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get the current master story for a session
   */
  async getCurrentStory(sessionId: string): Promise<string | null> {
    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.summaryType, "master_story")
      ),
      orderBy: desc(sessionSummaries.version),
    });

    return summary?.narrativeSummary || null;
  }

  /**
   * Get story metadata
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
      orderBy: desc(sessionSummaries.version),
    });

    if (!summary) return null;

    return {
      version: summary.version,
      length: summary.narrativeSummary?.length || 0,
      lastUpdated: summary.createdAt,
      totalTokens: summary.tokenCount || 0,
    };
  }

  /**
   * Initialize a new story for a session
   * @param sessionId The session ID
   * @param goalContext Optional goal context including Linear issue, related docs
   */
  async initializeStory(sessionId: string, goalContext?: GoalContext): Promise<void> {
    let initialStory = "";

    if (goalContext?.sessionGoal || goalContext?.linearIssueTitle) {
      const goalDescription = goalContext.linearIssueTitle
        ? `${goalContext.linearIssueId ? `[${goalContext.linearIssueId}] ` : ""}${goalContext.linearIssueTitle}`
        : goalContext.sessionGoal;

      initialStory = `Session started with goal: ${goalDescription}\n\n`;

      if (goalContext.relatedDocsContext) {
        initialStory += `Related context from knowledge base was loaded.\n\n`;
      }
    }

    await db.insert(sessionSummaries).values({
      sessionId,
      version: 0,
      summaryType: "master_story",
      narrativeSummary: initialStory,
      modelUsed: "system",
      tokenCount: 0,
      generationTimeMs: 0,
    });

    console.log(
      `[MasterStory] Initialized story for session ${sessionId}${goalContext?.sessionGoal ? ` with goal` : ""}`
    );
  }

  /**
   * Get user context for storyteller prompt
   */
  private async getUserContext(userId: string): Promise<{
    role: string;
    seniority: string;
    workContext: string;
  }> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return {
          role: "Team member",
          seniority: "",
          workContext: "Working on their tasks",
        };
      }

      // Build context from user data
      const role = user.firstName ? `${user.firstName}` : "Team member";

      return {
        role,
        seniority: "", // Could be enhanced with user profile data
        workContext: "Working on their tasks", // Could be enhanced with team/project data
      };
    } catch (error) {
      console.warn("[MasterStory] Failed to get user context:", error);
      return {
        role: "Team member",
        seniority: "",
        workContext: "Working on their tasks",
      };
    }
  }

  /**
   * Truncate story if it exceeds max length
   */
  private truncateStory(story: string): string {
    if (story.length <= STORY_CONFIG.MAX_STORY_LENGTH) {
      return story;
    }

    // Keep the last portion of the story to maintain context
    const truncated = story.slice(-STORY_CONFIG.MAX_STORY_LENGTH);

    // Find the first complete sentence/paragraph
    const firstBreak = truncated.indexOf("\n\n");
    if (firstBreak > 0 && firstBreak < 1000) {
      return "... " + truncated.slice(firstBreak + 2);
    }

    return "... " + truncated;
  }

  /**
   * Check if the service is available
   */
  isAvailable(): boolean {
    return !!config.groq.apiKey;
  }
}

// Export singleton instance
export const masterStoryService = new MasterStoryService();
