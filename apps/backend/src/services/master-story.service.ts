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
import {
  createSessionLogger,
  createContentHash,
  createTimer,
  CHECKPOINTS,
  SESSION_EVENTS,
} from "../lib/sessionLogger";

// Configuration
const STORY_CONFIG = {
  MODEL: "openai/gpt-oss-120b", // Larger model for better narrative quality and less hallucination
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.4, // Slightly lower for more grounded outputs
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
    const timer = createTimer("MasterStory.extendStory");
    const log = createSessionLogger({
      sessionId: context.sessionId,
      userId: context.userId,
    });

    log.debug("Starting story extension", {
      action: context.frameAnalysis.summaryOfAction,
      app: context.windowInfo.appName,
      hasGoalContext: !!context.goalContext,
    });

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
      const currentStoryHash = createContentHash(currentStory);

      // CHECKPOINT: Log current story retrieval for debugging duplicate bug
      log.checkpoint(CHECKPOINTS.MASTER_STORY_EXTEND, {
        stage: "current_story_retrieved",
        currentVersion,
        currentStoryLength: currentStory.length,
        currentStoryHash,
        currentStoryPrefix: currentStory.slice(0, 150),
        queryParams: {
          sessionId: context.sessionId,
          summaryType: "master_story",
        },
      });

      // Get user context for the prompt
      const userContext = await this.getUserContext(context.userId);

      // Build the storyteller prompt with goal context and grounding data
      const { system, user } = buildStorytellerPrompt({
        userRole: userContext.role,
        userSeniority: userContext.seniority,
        workContext: userContext.workContext,
        appName: context.windowInfo.appName,
        windowTitle: context.windowInfo.windowTitle,
        currentStory: this.truncateStory(currentStory),
        latestAction: context.frameAnalysis.summaryOfAction,
        goalContext: context.goalContext,
        // Grounding data from frame analysis (prevents hallucination)
        extractedArtifacts: context.frameAnalysis.artifacts,
        detectedSignals: context.frameAnalysis.signals,
        changeType: context.frameAnalysis.changeType,
        changeMagnitude: context.frameAnalysis.changeMagnitude,
      });

      // Log the AI prompt for debugging
      log.logAIInteraction("storyteller_prompt", `${system}\n\n${user}`, undefined, {
        model: STORY_CONFIG.MODEL,
        inputStoryHash: currentStoryHash,
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

      const updatedStoryHash = createContentHash(updatedStory);

      // Log the AI response
      log.logAIInteraction("storyteller_response", "", rawStory, {
        model: STORY_CONFIG.MODEL,
        inputStoryHash: currentStoryHash,
        outputStoryHash: updatedStoryHash,
        tokensUsed: response.usage?.total_tokens,
      });

      // Save to database
      const newVersion = currentVersion + 1;
      await db.insert(sessionSummaries).values({
        sessionId: context.sessionId,
        version: newVersion,
        summaryType: "master_story",
        narrativeSummary: updatedStory,
        modelUsed: STORY_CONFIG.MODEL,
        tokenCount: response.usage?.total_tokens || 0,
        generationTimeMs: timer.elapsed(),
      });

      // CHECKPOINT: Log story save for debugging
      log.checkpoint(CHECKPOINTS.MASTER_STORY_EXTEND, {
        stage: "story_saved",
        newVersion,
        newStoryLength: updatedStory.length,
        newStoryHash: updatedStoryHash,
        newStoryPrefix: updatedStory.slice(0, 150),
        tokensUsed: response.usage?.total_tokens || 0,
        durationMs: timer.elapsed(),
      });

      log.info("Story extended successfully", {
        version: newVersion,
        storyLength: updatedStory.length,
        durationMs: timer.elapsed(),
      });

      // Track analytics event
      log.trackEvent(SESSION_EVENTS.MASTER_STORY_EXTENDED, {
        version: newVersion,
        storyLength: updatedStory.length,
        tokensUsed: response.usage?.total_tokens || 0,
        durationMs: timer.elapsed(),
      });

      return {
        success: true,
        version: newVersion,
        storyLength: updatedStory.length,
        tokensUsed: response.usage?.total_tokens || 0,
        latencyMs: timer.elapsed(),
      };
    } catch (error) {
      log.error("Failed to extend story", {
        error: error instanceof Error ? error.message : String(error),
        durationMs: timer.elapsed(),
      });

      return {
        success: false,
        version: 0,
        storyLength: 0,
        tokensUsed: 0,
        latencyMs: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get the current master story for a session
   * CRITICAL: This is a key debugging point for the duplicate summary bug.
   * We log exactly what query is executed and what is returned.
   */
  async getCurrentStory(sessionId: string): Promise<string | null> {
    const log = createSessionLogger({ sessionId });

    log.debug("Retrieving current master story", { sessionId });

    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.summaryType, "master_story")
      ),
      orderBy: desc(sessionSummaries.version),
    });

    const story = summary?.narrativeSummary || null;

    // CHECKPOINT: Critical for debugging duplicate bug
    // Log exactly what was retrieved for which session
    log.checkpoint(CHECKPOINTS.MASTER_STORY_RETRIEVAL, {
      querySessionId: sessionId,
      resultFound: !!summary,
      resultVersion: summary?.version ?? null,
      resultStoryLength: story?.length ?? 0,
      resultStoryHash: story ? createContentHash(story) : null,
      resultStoryPrefix: story ? story.slice(0, 150) : null,
      resultSessionIdFromDb: summary?.sessionId ?? null,
      // CRITICAL: Check if the returned sessionId matches the query
      sessionIdMatch: summary?.sessionId === sessionId,
    });

    // Alert if there's a mismatch (this would indicate a serious bug)
    if (summary && summary.sessionId !== sessionId) {
      log.error("CRITICAL: Session ID mismatch in getCurrentStory!", {
        querySessionId: sessionId,
        returnedSessionId: summary.sessionId,
        version: summary.version,
      });
    }

    return story;
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
    const log = createSessionLogger({ sessionId });

    log.debug("Initializing master story", {
      hasGoalContext: !!goalContext,
      hasLinearIssue: !!goalContext?.linearIssueId,
      hasRelatedDocs: !!goalContext?.relatedDocsContext,
    });

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

    const initialStoryHash = createContentHash(initialStory);

    await db.insert(sessionSummaries).values({
      sessionId,
      version: 0,
      summaryType: "master_story",
      narrativeSummary: initialStory,
      modelUsed: "system",
      tokenCount: 0,
      generationTimeMs: 0,
    });

    // CHECKPOINT: Log story initialization
    log.checkpoint(CHECKPOINTS.MASTER_STORY_INIT, {
      version: 0,
      initialStoryLength: initialStory.length,
      initialStoryHash,
      hasGoal: !!goalContext?.sessionGoal,
      hasLinearIssue: !!goalContext?.linearIssueId,
      goalPreview: goalContext?.sessionGoal?.slice(0, 100) ?? null,
    });

    log.info("Story initialized", {
      hasGoal: !!goalContext?.sessionGoal,
    });
  }

  /**
   * Get user context for storyteller prompt
   */
  private async getUserContext(userId: string): Promise<{
    role: string;
    seniority: string;
    workContext: string;
  }> {
    const log = createSessionLogger({ sessionId: "system", userId });

    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        log.debug("User not found, using default context", { userId });
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
      log.warn("Failed to get user context", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
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
