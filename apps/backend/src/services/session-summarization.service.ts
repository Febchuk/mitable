/**
 * Session Summarization Service
 *
 * AI pipeline for analyzing monitoring session screenshots and generating
 * narrative summaries of work activity.
 *
 * Pipeline:
 * 1. Screenshot Analysis (Gemini Vision) - Extract activity descriptions
 * 2. Activity Aggregation (Groq) - Group and deduplicate activities
 * 3. Narrative Generation (Groq) - Create human-readable summary
 *
 * Cost optimization:
 * - Sample screenshots (don't analyze all)
 * - Batch vision API calls
 * - Use Groq for text (10x cheaper than OpenAI)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { promises as fs } from "fs";
import { config } from "../config";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, asc, desc } from "drizzle-orm";
import { masterStoryService } from "./master-story.service";
import { graphContextBuilderService } from "./graph/graph-context-builder.service";
import {
  createSessionLogger,
  createContentHash,
  createTimer,
  checkDuplicateSummary,
  CHECKPOINTS,
  SESSION_EVENTS,
} from "../domains/shared-infra/lib/sessionLogger.js";
import { logger } from "../domains/shared-infra/lib/logger.js";

// Configuration
const SUMMARIZATION_CONFIG = {
  MAX_SCREENSHOTS_TO_ANALYZE: 50, // Sample at most 50 screenshots
  VISION_BATCH_SIZE: 5, // Analyze 5 screenshots per API call
  VISION_MODEL: "gemini-2.5-flash",
  TEXT_MODEL: "openai/gpt-oss-120b", // Larger model for better accuracy, less hallucination
  TEMPERATURE: 0.2, // Low temp for factual, grounded outputs
  // Episode segmentation settings
  EPISODE_TIME_GAP_MS: 120000, // 2 minutes gap starts a new episode
  EPISODE_MIN_FRAMES: 2, // Minimum frames to form an episode
  // Sampling settings
  TIME_BUCKET_MS: 180000, // 3 minute buckets for temporal coverage
};

// Types
interface ScreenshotAnalysis {
  captureId: string;
  sequenceNumber: number;
  timestamp: number;
  appName: string;
  windowTitle: string;
  activity: string;
  context: string[];
  confidence: "high" | "medium" | "low";
}

interface AggregatedActivity {
  activity: string;
  appName: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  occurrences: number;
}

/**
 * Episode: A contiguous segment of related work
 * Episodes are separated by time gaps, app switches, or activity changes
 */
interface Episode {
  id: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  appName: string;
  frames: ScreenshotAnalysis[];
  // Aggregated info
  primaryActivity: string;
  activities: string[];
  hasBlocker: boolean;
  hasOutcome: boolean;
  artifacts: Array<{ type: string; value: string }>;
  confidence: "high" | "medium" | "low";
}

interface TaskBreakdownItem {
  shortTitle: string;
  description: string;
  minutes: number;
}

interface SessionSummaryResult {
  narrativeSummary: string;
  activities: string[];
  timeBreakdown: Record<string, number>;
  taskBreakdown: TaskBreakdownItem[];
  keyActivities: Array<{
    activity: string;
    timestamp: string;
    confidence: number;
  }>;
  accomplishments: string[];
  blockers: string[];
  modelUsed: string;
  tokenCount: number;
  generationTimeMs: number;
}

class SessionSummarizationService {
  private genAI: GoogleGenerativeAI;
  private visionModel: any;
  private groq: Groq;
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.visionModel = this.genAI.getGenerativeModel({
      model: SUMMARIZATION_CONFIG.VISION_MODEL,
    });
    this.groq = new Groq({ apiKey: config.groq.apiKey });

    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    }
    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
    }
  }

  /**
   * Generate a complete summary for a monitoring session
   * Primary path: Use master story (generated at session end)
   * Fallback path: Batch screenshot analysis (if master story unavailable)
   */
  async generateSessionSummary(sessionId: string): Promise<SessionSummaryResult> {
    const timer = createTimer("SessionSummarization.generateSessionSummary");
    const log = createSessionLogger({ sessionId });

    log.info("Starting summary generation");

    // CHECKPOINT: Log start of summary generation
    log.checkpoint(CHECKPOINTS.SUMMARY_GENERATION_START, {
      stage: "started",
    });

    // 1. Try to use master story (primary path)
    const masterStory = await masterStoryService.getCurrentStory(sessionId);
    const masterStoryHash = masterStory ? createContentHash(masterStory) : null;

    // CHECKPOINT: Log path decision
    log.checkpoint(CHECKPOINTS.SUMMARY_PATH_DECISION, {
      hasMasterStory: !!masterStory,
      masterStoryLength: masterStory?.length || 0,
      masterStoryHash,
      masterStoryPrefix: masterStory?.slice(0, 150) ?? null,
      pathChosen: masterStory && masterStory.length >= 50 ? "master_story" : "screenshot_fallback",
    });

    if (masterStory && masterStory.length >= 50) {
      log.info("Using master story path for summary", {
        masterStoryLength: masterStory.length,
        masterStoryHash,
      });

      // Track path decision
      log.trackEvent(SESSION_EVENTS.SUMMARY_PATH_USED, {
        path: "master_story",
        masterStoryLength: masterStory.length,
      });

      return await this.generateSummaryFromMasterStory(sessionId, masterStory, timer);
    }

    // 2. Fallback to batch analysis if master story unavailable
    log.warn("Master story unavailable or too short, falling back to screenshot analysis", {
      masterStoryLength: masterStory?.length || 0,
    });

    // Track path decision
    log.trackEvent(SESSION_EVENTS.SUMMARY_PATH_USED, {
      path: "screenshot_fallback",
      masterStoryLength: masterStory?.length || 0,
      reason: !masterStory ? "no_master_story" : "master_story_too_short",
    });

    return await this.generateSummaryFromScreenshots(sessionId, timer);
  }

  /**
   * Generate summary from master story (primary path)
   * Much faster and cheaper than re-analyzing screenshots
   */
  private async generateSummaryFromMasterStory(
    sessionId: string,
    masterStory: string,
    timer: ReturnType<typeof createTimer>
  ): Promise<SessionSummaryResult> {
    const log = createSessionLogger({ sessionId });
    const masterStoryHash = createContentHash(masterStory);

    log.debug("Generating summary from master story", {
      masterStoryLength: masterStory.length,
      masterStoryHash,
    });

    // Get session for metadata
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      log.error("Session not found", { sessionId });
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Get key activities from frame metadata (already analyzed)
    const keyActivities = await this.getKeyActivitiesFromFrames(sessionId);

    // CHECKPOINT: Log input to AI refinement
    log.checkpoint(CHECKPOINTS.SUMMARY_GENERATION_INPUT, {
      masterStoryLength: masterStory.length,
      masterStoryHash,
      masterStoryPrefix: masterStory.slice(0, 200),
      keyActivitiesCount: keyActivities.length,
    });

    // Optionally refine the master story for delivery
    const refinedSummary = await this.refineMasterStoryForDelivery(masterStory, sessionId);

    const generationTimeMs = timer.elapsed();
    const outputHash = createContentHash(refinedSummary.summary);

    // CHECKPOINT: Log AI refinement output
    log.checkpoint(CHECKPOINTS.AI_REFINEMENT_OUTPUT, {
      inputHash: masterStoryHash,
      outputHash,
      outputLength: refinedSummary.summary.length,
      outputPrefix: refinedSummary.summary.slice(0, 200),
      activitiesCount: refinedSummary.activities.length,
      accomplishmentsCount: refinedSummary.accomplishments.length,
      blockersCount: refinedSummary.blockers.length,
      tokensUsed: refinedSummary.tokenCount,
      durationMs: generationTimeMs,
    });

    log.info("Summary generated from master story", {
      durationMs: generationTimeMs,
      outputLength: refinedSummary.summary.length,
    });

    const summary = {
      narrativeSummary: refinedSummary.summary,
      activities: refinedSummary.activities,
      timeBreakdown: {},
      taskBreakdown: refinedSummary.taskBreakdown,
      keyActivities,
      accomplishments: refinedSummary.accomplishments,
      blockers: refinedSummary.blockers,
      modelUsed: SUMMARIZATION_CONFIG.TEXT_MODEL,
      tokenCount: refinedSummary.tokenCount,
    };

    // Save summary to database
    await this.saveSummary(sessionId, summary, generationTimeMs);

    return {
      ...summary,
      generationTimeMs,
    };
  }

  /**
   * Generate summary from screenshots (fallback path)
   * Used when master story is unavailable or incomplete
   */
  private async generateSummaryFromScreenshots(
    sessionId: string,
    timer: ReturnType<typeof createTimer>
  ): Promise<SessionSummaryResult> {
    const log = createSessionLogger({ sessionId });

    log.info("Generating summary from screenshots (fallback path)");

    // 1. Get session and captures from database
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      log.error("Session not found", { sessionId });
      throw new Error(`Session not found: ${sessionId}`);
    }

    const captures = await db
      .select()
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, sessionId))
      .orderBy(schema.sessionCaptures.sequenceNumber);

    log.debug("Found captures for analysis", { captureCount: captures.length });

    // 2. Sample captures for analysis (with temporal coverage)
    const sampled = this.sampleCaptures(captures);
    log.debug("Sampled captures for analysis", {
      originalCount: captures.length,
      sampledCount: sampled.length,
    });

    // 3. Analyze screenshots with Gemini Vision
    const analyses = await this.analyzeScreenshots(sampled);
    log.debug("Analyzed screenshots", { analysisCount: analyses.length });

    // 4. Build episodes from analyses (time-aware segmentation)
    const episodes = this.buildEpisodes(analyses, sampled);
    log.debug("Segmented into episodes", { episodeCount: episodes.length });

    // 5. Convert episodes to activities for narrative generation
    const aggregated = this.episodesToActivities(episodes);
    log.debug("Aggregated activities", { activityCount: aggregated.length });

    // 6. Generate narrative summary with episode context
    const summary = await this.generateNarrative(aggregated, analyses, episodes);

    const generationTimeMs = timer.elapsed();
    log.info("Summary generated from screenshots", {
      durationMs: generationTimeMs,
      captureCount: captures.length,
      episodeCount: episodes.length,
    });

    // 7. Save summary to database
    await this.saveSummary(sessionId, summary, generationTimeMs);

    return {
      ...summary,
      generationTimeMs,
    };
  }

  /**
   * Get key activities from frame metadata (already analyzed during session)
   */
  private async getKeyActivitiesFromFrames(sessionId: string): Promise<
    Array<{
      activity: string;
      timestamp: string;
      confidence: number;
    }>
  > {
    const captures = await db
      .select()
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, sessionId))
      .orderBy(desc(schema.sessionCaptures.importanceScore));

    // Get top 5 high-importance frames with meaningful changes
    const keyFrames = captures
      .filter((c) => c.deltaChanged && c.deltaChangeDescription && (c.importanceScore || 0) >= 0.5)
      .slice(0, 5);

    return keyFrames.map((frame) => ({
      activity: frame.deltaChangeDescription || "Activity detected",
      timestamp: new Date(frame.capturedAt).toISOString(),
      confidence: frame.importanceScore || 0.5,
    }));
  }

  /**
   * Refine master story for delivery
   * Optionally formats and extracts structured data
   */
  private buildGraphContextPromptBlock(block?: {
    summaryFacts: string[];
    personalizationHints: string[];
    confidenceNotes: string[];
  }): string {
    if (!block) return "";

    const sections: string[] = [];
    if (block.summaryFacts.length > 0) {
      sections.push(
        `- Observed work profile:\n${block.summaryFacts.map((v) => `  - ${v}`).join("\n")}`
      );
    }
    if (block.personalizationHints.length > 0) {
      sections.push(
        `- Personalization hints:\n${block.personalizationHints.map((v) => `  - ${v}`).join("\n")}`
      );
    }
    if (block.confidenceNotes.length > 0) {
      sections.push(
        `- Confidence notes:\n${block.confidenceNotes.map((v) => `  - ${v}`).join("\n")}`
      );
    }

    if (sections.length === 0) return "";

    return `\n<graph_context>\nUse these inferred workflow insights to shape emphasis and wording, but do not invent facts that are not in the session data:\n${sections.join("\n")}\n</graph_context>\n`;
  }

  private async refineMasterStoryForDelivery(
    masterStory: string,
    sessionId: string
  ): Promise<{
    summary: string;
    activities: string[];
    accomplishments: string[];
    blockers: string[];
    taskBreakdown: TaskBreakdownItem[];
    tokenCount: number;
  }> {
    const log = createSessionLogger({ sessionId });
    const inputHash = createContentHash(masterStory);

    log.debug("Refining master story for delivery", {
      inputLength: masterStory.length,
      inputHash,
    });

    // Look up user preferences from user_memories
    const session = await db.query.monitoringSessions.findFirst({
      where: eq(schema.monitoringSessions.id, sessionId),
      columns: { userId: true, organizationId: true },
    });

    let userPrefsBlock = "";
    if (session?.userId) {
      const prefs = await db.query.userMemories.findMany({
        where: and(
          eq(schema.userMemories.userId, session.userId),
          eq(schema.userMemories.category, "summary_style")
        ),
        columns: { content: true },
      });

      if (prefs.length > 0) {
        const prefsList = prefs.map((p) => `- ${p.content}`).join("\n");
        userPrefsBlock = `\n<user_preferences>\nThe user has saved the following summary style preferences. You MUST apply ALL of them:\n${prefsList}\n</user_preferences>\n`;
        log.debug("Applying user preferences to summary", {
          preferencesCount: prefs.length,
        });
      }
    }

    let graphContextBlock = "";
    if (session?.userId && session.organizationId && config.graph.enabled) {
      try {
        const graphContext = await graphContextBuilderService.buildForUser(
          session.userId,
          session.organizationId
        );
        graphContextBlock = this.buildGraphContextPromptBlock(graphContext);
      } catch (error) {
        log.warn("Failed to load graph context for summary refinement", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Build time-per-app breakdown from captures
    // Strategy: attribute each capture-to-capture interval to the app active at that moment.
    // This ensures every second between captures is accounted for (no dropped sub-minute gaps).
    const captures = await db
      .select({
        capturedAt: schema.sessionCaptures.capturedAt,
        appName: schema.sessionCaptures.appName,
      })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, sessionId))
      .orderBy(asc(schema.sessionCaptures.capturedAt));

    // Fetch session endedAt to extend the last segment to actual session end
    const sessionRow = await db.query.monitoringSessions.findFirst({
      where: eq(schema.monitoringSessions.id, sessionId),
      columns: { endedAt: true },
    });

    let timeBreakdownBlock = "";
    if (captures.length >= 2) {
      // Step 1: Build per-interval milliseconds by app
      const appMs = new Map<string, number>();
      const segments: { app: string; startTime: Date; endTime: Date; ms: number }[] = [];
      let currentApp = captures[0].appName || "Unknown";
      let segStart = new Date(captures[0].capturedAt);

      for (let i = 1; i < captures.length; i++) {
        const app = captures[i].appName || "Unknown";
        const captureTime = new Date(captures[i].capturedAt);
        const intervalMs = captureTime.getTime() - new Date(captures[i - 1].capturedAt).getTime();

        // Attribute this interval to the previous capture's app
        const prevApp = captures[i - 1].appName || "Unknown";
        appMs.set(prevApp, (appMs.get(prevApp) || 0) + intervalMs);

        // Track chronological segments (merge consecutive same-app)
        if (app !== currentApp) {
          segments.push({
            app: currentApp,
            startTime: segStart,
            endTime: captureTime,
            ms: captureTime.getTime() - segStart.getTime(),
          });
          currentApp = app;
          segStart = captureTime;
        }
      }

      // Extend final segment to session endedAt (if available) so tail time isn't lost
      const lastCapture = new Date(captures[captures.length - 1].capturedAt);
      const segEnd = sessionRow?.endedAt ? new Date(sessionRow.endedAt) : lastCapture;
      const tailMs = segEnd.getTime() - lastCapture.getTime();
      if (tailMs > 0) {
        const lastApp = captures[captures.length - 1].appName || "Unknown";
        appMs.set(lastApp, (appMs.get(lastApp) || 0) + tailMs);
      }
      segments.push({
        app: currentApp,
        startTime: segStart,
        endTime: segEnd,
        ms: segEnd.getTime() - segStart.getTime(),
      });

      // Convert ms to minutes (round to nearest)
      const totalMinutes = Math.round([...appMs.values()].reduce((a, b) => a + b, 0) / 60000);

      // Build the chronological segment list + app totals
      const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const segmentLines = segments
        .filter((s) => s.ms >= 30000) // drop segments < 30s
        .map(
          (s) => `- ${s.app}: ${Math.round(s.ms / 60000)}m (${fmt(s.startTime)}-${fmt(s.endTime)})`
        );
      const appTotalLines = [...appMs.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([app, ms]) => `- ${app}: ${Math.round(ms / 60000)}m`);

      timeBreakdownBlock = `\n<time_breakdown total_minutes="${totalMinutes}">
CHRONOLOGICAL SEGMENTS:
${segmentLines.join("\n")}

APP TOTALS:
${appTotalLines.join("\n")}
</time_breakdown>\n`;

      log.debug("Built time breakdown for extraction", {
        segments: segments.length,
        totalMinutes,
        apps: appMs.size,
      });
    }

    // Use Claude to extract structured data from the master story
    const prompt = `<task>
Extract structured information from a work session narrative written in first person. Transform the detailed narrative into a task-oriented summary grouped by observed tasks.
</task>

<input>
<master_story>
${masterStory}
</master_story>
</input>
${timeBreakdownBlock}${userPrefsBlock}
${graphContextBlock}
<instructions>
<summary_requirements>
TASK-ORIENTED FORMAT:
Break the session into distinct tasks. Each task is a bullet point with a bold label and a description.

A "task" is a coherent unit of work. Examples:
- Working on a customer issue → the task label includes the customer name
- Attending a meeting → the meeting is the task
- Debugging a feature → the feature/ticket is the task
- Researching a topic → the topic is the task
- Casual browsing → "General Browsing" is the task

TASK LABEL RULES:
- If a customer, client, or external entity is involved, include their name: "**[Customer] — [Topic]**"
- If it's a meeting, name it: "**[Meeting Name]**" or "**1:1 with [Person]**"
- If it's internal work, name the feature/project: "**[Feature/Project Name]**" or "**[Ticket] Review**"
- If it's general/unrelated, use a descriptive label: "**Email Triage**" or "**General Browsing**"

FORMAT:
- **Task Label** (Xm): Description of what was done for this task. Keep it to 1-3 sentences.

TIME ATTRIBUTION:
- If a <time_breakdown> is provided, use it to calculate minutes per task
- Map the chronological app segments to tasks based on the narrative context
- Include the duration in parentheses after each task label: "**Task Label** (12m):"
- All task durations MUST sum to the total_minutes from the time breakdown
- If no time breakdown is available, omit the duration parentheses

RULES:
- First person ("I"), casual tone (like a Slack update)
- 2-7 task bullets depending on session length
- Each bullet = one task, with everything done for that task grouped under it
- Customer/client names MUST appear in the task label when identifiable
- All names, topics, and systems must come from the actual master story — never invent
- Collapse related micro-actions into the task description (outcomes, not keystrokes)
</summary_requirements>

<activities_requirements>
- Count: One entry per task (matching the summary bullets)
- Format: The task labels only (without the ** markdown)
- Examples: "[Customer] — Ticket Triage", "Weekly Standup", "Search Feature Refactor"
</activities_requirements>

<accomplishments_requirements>
- Include: Completed items, shipped features, unblocked work
- Format: Short, specific descriptions
- If none: Return empty array []
</accomplishments_requirements>

<blockers_requirements>
- Include: Waiting states, errors, repeated attempts, blocked progress
- Format: Short descriptions of what blocked progress
- If none: Return empty array []
</blockers_requirements>
</instructions>

<output_format>
Respond with valid JSON only:
{
  "summary": "- **Task Label** (Xm): Description of what was done\\n- **Task Label 2** (Ym): Description...",
  "tasks": [
    { "shortTitle": "Short Label", "description": "Description of what was done for this task.", "minutes": X },
    { "shortTitle": "Short Label 2", "description": "Description...", "minutes": Y }
  ],
  "activities": ["Task Label", "Task Label 2"],
  "accomplishments": ["Accomplishment 1"] or [],
  "blockers": ["Blocker 1"] or []
}

TASK OBJECT RULES:
- "shortTitle": Max 3-4 words. Concise label for the task (e.g., "Disk Space Incident", "Team Standup", "IPDF Code Review")
- "description": 1-3 sentences describing what was done. First person, casual tone.
- "minutes": Time spent on this task (from time_breakdown). Must sum to total_minutes.
- The tasks array MUST match the summary bullets 1:1 in order.

EXAMPLE (structure only — your content must come from the actual master story, never these placeholders):
{
  "summary": "- **[Customer A] — Support Ticket Triage** (15m): I reviewed three open tickets for [Customer A] in the helpdesk, escalated the billing issue, and closed the two resolved ones.\\n- **Weekly Standup** (10m): Joined the team standup, shared progress on the migration project and flagged the API dependency blocker.\\n- **Search Feature Refactor** (20m): Refactored the search indexing logic to support fuzzy matching, ran tests locally and pushed the branch for review.",
  "tasks": [
    { "shortTitle": "Ticket Triage", "description": "I reviewed three open tickets for Customer A, escalated the billing issue, and closed the two resolved ones.", "minutes": 15 },
    { "shortTitle": "Weekly Standup", "description": "Joined the team standup, shared progress on the migration project and flagged the API dependency blocker.", "minutes": 10 },
    { "shortTitle": "Search Refactor", "description": "Refactored the search indexing logic to support fuzzy matching, ran tests locally and pushed the branch for review.", "minutes": 20 }
  ],
  "activities": ["[Customer A] — Support Ticket Triage", "Weekly Standup", "Search Feature Refactor"],
  "accomplishments": ["Closed 2 resolved support tickets"],
  "blockers": ["Waiting on API credentials for migration"]
}
</output_format>`;

    // Log AI prompt for debugging
    log.logAIInteraction("refinement_prompt", prompt, undefined, {
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      inputHash,
    });

    // Log full prompt for deep debugging (when SESSION_LOG_FULL_AI=true)
    log.logFullAIInteraction(
      "refinement_prompt_full",
      "", // No separate system prompt for this call
      prompt,
      "", // Response comes later
      {
        model: SUMMARIZATION_CONFIG.TEXT_MODEL,
        masterStoryLength: masterStory.length,
        inputHash,
      }
    );

    let response = "";
    let tokensUsed = 0;
    let modelUsed = "";

    if (this.anthropic) {
      try {
        const claudeResult = await this.anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 16384,
          messages: [{ role: "user", content: prompt }],
        });
        response = claudeResult.content[0]?.type === "text" ? claudeResult.content[0].text : "";
        tokensUsed =
          (claudeResult.usage?.input_tokens || 0) + (claudeResult.usage?.output_tokens || 0);
        modelUsed = "claude-sonnet-4-5-20250929";
        log.debug("Extraction via Claude Sonnet 4.5");
      } catch (claudeError) {
        log.warn("Claude extraction failed, falling back to OpenAI", {
          error: claudeError instanceof Error ? claudeError.message : String(claudeError),
        });
      }
    }

    // Fallback to OpenAI if Claude unavailable or failed
    if (!response && this.openai) {
      try {
        const openaiResult = await this.openai.chat.completions.create({
          model: "gpt-5",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 16384,
        });
        response = openaiResult.choices[0]?.message?.content || "";
        tokensUsed = openaiResult.usage?.total_tokens || 0;
        modelUsed = "gpt-5";
        log.debug("Extraction via OpenAI fallback");
      } catch (openaiError) {
        log.warn("OpenAI extraction failed, falling back to DeepSeek", {
          error: openaiError instanceof Error ? openaiError.message : String(openaiError),
        });
      }
    }

    // Fallback to DeepSeek if OpenAI also failed
    if (!response && this.deepseek) {
      try {
        const dsResult = await this.deepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 16384,
        });
        response = dsResult.choices[0]?.message?.content || "";
        tokensUsed = dsResult.usage?.total_tokens || 0;
        modelUsed = "deepseek-chat";
        log.debug("Extraction via DeepSeek fallback");
      } catch (dsError) {
        log.warn("DeepSeek extraction also failed", {
          error: dsError instanceof Error ? dsError.message : String(dsError),
        });
      }
    }
    const parsed = this.parseJsonResponse(response);

    const outputSummary = parsed.summary || masterStory;
    const outputHash = createContentHash(outputSummary);

    // Log AI response for debugging
    log.logAIInteraction("refinement_response", "", response, {
      model: modelUsed,
      inputHash,
      outputHash,
      tokensUsed,
      parsedSuccessfully: !!parsed.summary,
    });

    // Log full response for deep debugging (when SESSION_LOG_FULL_AI=true)
    log.logFullAIInteraction(
      "refinement_response_full",
      "", // Prompt already logged
      "", // Prompt already logged
      response,
      {
        model: modelUsed,
        inputHash,
        outputHash,
        tokensUsed,
        parsedSuccessfully: !!parsed.summary,
        parsedSummaryLength: parsed.summary?.length || 0,
        parsedActivitiesCount: parsed.activities?.length || 0,
        parsedAccomplishmentsCount: parsed.accomplishments?.length || 0,
        parsedBlockersCount: parsed.blockers?.length || 0,
      }
    );

    log.debug("Master story refined", {
      inputHash,
      outputHash,
      outputLength: outputSummary.length,
      activitiesCount: (parsed.activities || []).length,
    });

    // Parse tasks array for structured task breakdown
    const taskBreakdown: TaskBreakdownItem[] = (parsed.tasks || []).map((t: any) => ({
      shortTitle: t.shortTitle || "Task",
      description: t.description || "",
      minutes: t.minutes || 0,
    }));

    return {
      summary: outputSummary,
      activities: parsed.activities || [],
      accomplishments: parsed.accomplishments || [],
      blockers: parsed.blockers || [],
      taskBreakdown,
      tokenCount: tokensUsed,
    };
  }

  /**
   * Sample captures for analysis using analysis metadata
   * Enhanced with temporal coverage to ensure narrative coherence
   *
   * Prioritizes:
   * 1. Temporal coverage - at least 1 frame per time bucket
   * 2. Event boundaries - frames with blockers/outcomes
   * 3. Context switches - first occurrence of new app/window
   * 4. High importance scores
   * 5. Frames with delta_changed = true
   */
  private sampleCaptures(captures: any[]): any[] {
    if (captures.length === 0) return [];

    // Filter out duplicates and skipped frames
    const valid = captures.filter(
      (c) => c.analysisStatus !== "duplicate" && c.analysisStatus !== "skipped"
    );

    if (valid.length <= SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE) {
      return valid;
    }

    const maxToSample = SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE;
    const sampledIds = new Set<string>();
    const sampled: any[] = [];

    const addCapture = (capture: any) => {
      if (!sampledIds.has(capture.id) && sampled.length < maxToSample) {
        sampledIds.add(capture.id);
        sampled.push(capture);
        return true;
      }
      return false;
    };

    // === STEP 1: Ensure temporal coverage ===
    // Group captures into time buckets and take best from each
    const timeBuckets = new Map<number, any[]>();
    const sessionStart = new Date(valid[0].capturedAt).getTime();

    for (const capture of valid) {
      const captureTime = new Date(capture.capturedAt).getTime();
      const bucketKey = Math.floor(
        (captureTime - sessionStart) / SUMMARIZATION_CONFIG.TIME_BUCKET_MS
      );
      if (!timeBuckets.has(bucketKey)) {
        timeBuckets.set(bucketKey, []);
      }
      timeBuckets.get(bucketKey)!.push(capture);
    }

    // Take the highest-importance frame from each time bucket
    const sortedBucketKeys = [...timeBuckets.keys()].sort((a, b) => a - b);
    for (const bucketKey of sortedBucketKeys) {
      const bucketFrames = timeBuckets.get(bucketKey)!;
      // Sort by importance within bucket
      bucketFrames.sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));
      // Take the best frame from this bucket
      if (bucketFrames.length > 0) {
        addCapture(bucketFrames[0]);
      }
    }

    // Note: logging moved to caller for session context

    // === STEP 2: Include event boundaries (blockers/outcomes) ===
    const eventFrames = valid.filter(
      (c) =>
        c.importanceReason?.includes("blocker") ||
        c.importanceReason?.includes("outcome") ||
        (c.importanceScore || 0) >= 0.7
    );
    for (const capture of eventFrames) {
      addCapture(capture);
    }

    // === STEP 3: Include context switches (first occurrence of new app/window) ===
    const seenApps = new Set<string>();
    for (const capture of valid) {
      const appKey = `${capture.appName}:${capture.windowTitle}`;
      if (!seenApps.has(appKey)) {
        seenApps.add(appKey);
        addCapture(capture);
      }
    }

    // === STEP 4: Fill remaining with high-importance frames ===
    const remaining = valid
      .filter((c) => !sampledIds.has(c.id))
      .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

    for (const capture of remaining) {
      if (!addCapture(capture)) break;
    }

    // === STEP 5: Always include first and last capture for context ===
    const firstCapture = valid[0];
    const lastCapture = valid[valid.length - 1];

    if (!sampled.includes(firstCapture)) {
      sampled.unshift(firstCapture);
      if (sampled.length > maxToSample) sampled.pop();
    }
    if (!sampled.includes(lastCapture)) {
      sampled.push(lastCapture);
      if (sampled.length > maxToSample) sampled.shift();
    }

    // Sort by sequence number for chronological order
    sampled.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    return sampled;
  }

  /**
   * Analyze screenshots using Gemini Vision
   */
  private async analyzeScreenshots(captures: any[]): Promise<ScreenshotAnalysis[]> {
    const analyses: ScreenshotAnalysis[] = [];

    // Batch captures for efficiency
    const batches = this.batchArray(captures, SUMMARIZATION_CONFIG.VISION_BATCH_SIZE);

    for (const batch of batches) {
      try {
        const batchAnalyses = await this.analyzeBatch(batch);
        analyses.push(...batchAnalyses);
      } catch (error) {
        // Log error but continue with other batches
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Batch analysis failed");
      }

      // Small delay between batches to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    return analyses;
  }

  /**
   * Analyze a batch of screenshots
   * Uses existing analysis data when available, only falls back to Gemini Vision for pending frames
   */
  private async analyzeBatch(captures: any[]): Promise<ScreenshotAnalysis[]> {
    const analyses: ScreenshotAnalysis[] = [];

    for (const capture of captures) {
      try {
        // Check if we already have analysis data from frame-analysis
        if (capture.analysisStatus === "analyzed" && capture.deltaChangeDescription) {
          // Use existing analysis data - no need to re-analyze
          analyses.push({
            captureId: capture.id,
            sequenceNumber: capture.sequenceNumber,
            timestamp: new Date(capture.capturedAt).getTime(),
            appName: capture.appName || "Unknown",
            windowTitle: capture.windowTitle || "",
            activity:
              capture.deltaChangeDescription ||
              capture.activityDescription ||
              this.inferActivityFromMetadata(capture),
            context: [
              capture.deltaChangeType ? `Action: ${capture.deltaChangeType}` : null,
              capture.deltaUserAction ? `User: ${capture.deltaUserAction}` : null,
              capture.taskRelevance || null,
            ].filter(Boolean) as string[],
            confidence:
              capture.importanceScore >= 0.7
                ? "high"
                : capture.importanceScore >= 0.4
                  ? "medium"
                  : "low",
          });
          continue;
        }

        // Check if we have image data for Vision analysis
        let imageData: string | null = capture.imageData || null;

        // Fallback: try to read from file if no imageData in DB (legacy support)
        if (!imageData && capture.screenshotPath) {
          try {
            const buffer = await fs.readFile(capture.screenshotPath);
            imageData = buffer.toString("base64");
          } catch (fileError) {
            // File not accessible (expected for remote clients)
          }
        }

        // No image data and no analysis - use metadata only
        if (!imageData) {
          analyses.push({
            captureId: capture.id,
            sequenceNumber: capture.sequenceNumber,
            timestamp: new Date(capture.capturedAt).getTime(),
            appName: capture.appName || "Unknown",
            windowTitle: capture.windowTitle || "",
            activity: capture.activityDescription || this.inferActivityFromMetadata(capture),
            context: [],
            confidence: "low",
          });
          continue;
        }

        // Analyze with Gemini Vision (only for frames without existing analysis)
        const prompt = `<task>
Analyze this screenshot and describe what the user is working on. Focus on WHAT they're doing and WHY (the goal or outcome), not the tools or technical details.
</task>

<guidelines>
1. **Focus on the work, not the tool:** Say "Fixing the login bug" instead of "Editing authentication.ts in VS Code"
2. **Capture specific context:** Include visible PR numbers, document names, ticket IDs, feature names - anything that makes the activity concrete
3. **Skip technical noise:** Don't mention programming languages, file extensions, or software names unless critical
4. **Be natural:** Describe it like you'd answer "What are you up to?" to a teammate
</guidelines>

<app_specific_knowledge>
**Cursor (AI Code Editor):**
- Right sidebar chat panel: User messages have a COLORED BORDER around them. AI responses have NO border.
- Code editor (left side):
  - BLUE vertical bar on left margin = modified existing code
  - GREEN vertical bar on left margin = entirely new code
</app_specific_knowledge>

<examples>
- "Fixing the navigation bug in the mobile app"
- "Reviewing PR #42 about the search improvements"
- "Responding to the customer support ticket about login issues"
- "Creating mockups for the new dashboard redesign"
- "Writing documentation for the API endpoints"
</examples>

<output_format>
Respond with JSON:
{
  "activity": "Brief description of what they're working on",
  "context": ["key detail 1", "key detail 2"],
  "confidence": "high" | "medium" | "low"
}
</output_format>`;

        const result = await this.visionModel.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: imageData,
            },
          },
        ]);

        const response = result.response.text();
        const parsed = this.parseJsonResponse(response);

        analyses.push({
          captureId: capture.id,
          sequenceNumber: capture.sequenceNumber,
          timestamp: new Date(capture.capturedAt).getTime(),
          appName: capture.appName || "Unknown",
          windowTitle: capture.windowTitle || "",
          activity: parsed.activity || this.inferActivityFromMetadata(capture),
          context: parsed.context || [],
          confidence: parsed.confidence || "medium",
        });

        // Update capture with analysis
        await db
          .update(schema.sessionCaptures)
          .set({
            analysisStatus: "analyzed",
            activityDescription: parsed.activity,
            confidence:
              parsed.confidence === "high" ? "0.9" : parsed.confidence === "medium" ? "0.7" : "0.5",
          })
          .where(eq(schema.sessionCaptures.id, capture.id));
      } catch (error) {
        // Log error and add fallback analysis
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage, captureId: capture.id }, "Failed to analyze capture");
        // Add fallback analysis
        analyses.push({
          captureId: capture.id,
          sequenceNumber: capture.sequenceNumber,
          timestamp: new Date(capture.capturedAt).getTime(),
          appName: capture.appName || "Unknown",
          windowTitle: capture.windowTitle || "",
          activity: capture.activityDescription || this.inferActivityFromMetadata(capture),
          context: [],
          confidence: "low",
        });
      }
    }

    return analyses;
  }

  /**
   * Infer activity from capture metadata when screenshot isn't available
   */
  private inferActivityFromMetadata(capture: any): string {
    const app = capture.appName || "";
    const title = capture.windowTitle || "";

    // Common app patterns
    if (app.toLowerCase().includes("code") || app.toLowerCase().includes("visual studio")) {
      if (title.includes(".ts") || title.includes(".tsx")) {
        return `Working in ${app} on TypeScript file`;
      }
      if (title.includes(".js") || title.includes(".jsx")) {
        return `Working in ${app} on JavaScript file`;
      }
      return `Working in ${app}`;
    }

    if (
      app.toLowerCase().includes("chrome") ||
      app.toLowerCase().includes("firefox") ||
      app.toLowerCase().includes("safari")
    ) {
      if (title.toLowerCase().includes("github")) {
        return "Browsing GitHub";
      }
      if (title.toLowerCase().includes("jira") || title.toLowerCase().includes("linear")) {
        return "Working on project management";
      }
      return `Browsing web: ${title.substring(0, 30)}`;
    }

    if (app.toLowerCase().includes("slack")) {
      return "Communicating in Slack";
    }

    if (app.toLowerCase().includes("figma")) {
      return "Designing in Figma";
    }

    if (app.toLowerCase().includes("notion")) {
      return "Working in Notion";
    }

    return `Using ${app}`;
  }

  /**
   * Build episodes from analyses - segments work into contiguous chunks
   * Episodes are separated by:
   * - Time gaps > EPISODE_TIME_GAP_MS
   * - App/window switches
   * - Significant activity changes
   */
  private buildEpisodes(analyses: ScreenshotAnalysis[], captures: any[]): Episode[] {
    if (analyses.length === 0) return [];

    const episodes: Episode[] = [];
    let currentEpisode: Episode | null = null;
    let episodeCounter = 0;

    // Build a map of capture metadata for signal/artifact lookup
    const captureMap = new Map<string, any>();
    for (const c of captures) {
      captureMap.set(c.id, c);
    }

    for (const analysis of analyses) {
      const capture = captureMap.get(analysis.captureId);
      const shouldStartNewEpisode =
        !currentEpisode ||
        // Time gap too large
        analysis.timestamp - currentEpisode.endTime > SUMMARIZATION_CONFIG.EPISODE_TIME_GAP_MS ||
        // App switched
        analysis.appName !== currentEpisode.appName;

      if (shouldStartNewEpisode) {
        // Save current episode if it has enough frames
        if (
          currentEpisode &&
          currentEpisode.frames.length >= SUMMARIZATION_CONFIG.EPISODE_MIN_FRAMES
        ) {
          currentEpisode.durationMs = currentEpisode.endTime - currentEpisode.startTime;
          currentEpisode.primaryActivity = this.getPrimaryActivity(currentEpisode.frames);
          currentEpisode.confidence = this.getEpisodeConfidence(currentEpisode.frames);
          episodes.push(currentEpisode);
        }

        // Start new episode
        episodeCounter++;
        currentEpisode = {
          id: `episode-${episodeCounter}`,
          startTime: analysis.timestamp,
          endTime: analysis.timestamp,
          durationMs: 0,
          appName: analysis.appName,
          frames: [],
          primaryActivity: "",
          activities: [],
          hasBlocker: false,
          hasOutcome: false,
          artifacts: [],
          confidence: "medium",
        };
      }

      // Add frame to current episode
      currentEpisode!.frames.push(analysis);
      currentEpisode!.endTime = analysis.timestamp;
      currentEpisode!.activities.push(analysis.activity);

      // Aggregate signals and artifacts from capture metadata
      if (capture) {
        if (capture.deltaChangeType === "error" || capture.importanceReason?.includes("blocker")) {
          currentEpisode!.hasBlocker = true;
        }
        if (
          capture.importanceReason?.includes("outcome") ||
          capture.importanceReason?.includes("success")
        ) {
          currentEpisode!.hasOutcome = true;
        }
        // Extract artifacts if stored in capture (future enhancement)
      }
    }

    // Don't forget the last episode
    if (currentEpisode && currentEpisode.frames.length >= SUMMARIZATION_CONFIG.EPISODE_MIN_FRAMES) {
      currentEpisode.durationMs = currentEpisode.endTime - currentEpisode.startTime;
      currentEpisode.primaryActivity = this.getPrimaryActivity(currentEpisode.frames);
      currentEpisode.confidence = this.getEpisodeConfidence(currentEpisode.frames);
      episodes.push(currentEpisode);
    }

    // Note: episode count logged by caller with session context
    return episodes;
  }

  /**
   * Get the most representative activity for an episode
   */
  private getPrimaryActivity(frames: ScreenshotAnalysis[]): string {
    // Count activity occurrences
    const activityCounts = new Map<string, number>();
    for (const frame of frames) {
      const simplified = this.simplifyActivity(frame.activity);
      activityCounts.set(simplified, (activityCounts.get(simplified) || 0) + 1);
    }

    // Find most common
    let maxCount = 0;
    let primaryKey = "";
    for (const [key, count] of activityCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryKey = key;
      }
    }

    // Return the full activity text from the first matching frame
    for (const frame of frames) {
      if (this.simplifyActivity(frame.activity) === primaryKey) {
        return frame.activity;
      }
    }
    return frames[0]?.activity || "Unknown activity";
  }

  /**
   * Get overall confidence for an episode based on frame confidences
   */
  private getEpisodeConfidence(frames: ScreenshotAnalysis[]): "high" | "medium" | "low" {
    const highCount = frames.filter((f) => f.confidence === "high").length;
    const mediumCount = frames.filter((f) => f.confidence === "medium").length;

    if (highCount >= frames.length * 0.5) return "high";
    if (highCount + mediumCount >= frames.length * 0.5) return "medium";
    return "low";
  }

  /**
   * Convert episodes to aggregated activities for narrative generation
   */
  private episodesToActivities(episodes: Episode[]): AggregatedActivity[] {
    return episodes.map((episode) => ({
      activity: episode.primaryActivity,
      appName: episode.appName,
      startTime: episode.startTime,
      endTime: episode.endTime,
      durationMs: episode.durationMs,
      occurrences: episode.frames.length,
    }));
  }

  /**
   * Simplify activity description for grouping
   */
  private simplifyActivity(activity: string): string {
    return activity
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(" ")
      .slice(0, 5)
      .join(" ");
  }

  /**
   * Generate narrative summary using Groq
   * Now uses episode-aware context for better narratives
   */
  private async generateNarrative(
    aggregated: AggregatedActivity[],
    analyses: ScreenshotAnalysis[],
    episodes?: Episode[]
  ): Promise<Omit<SessionSummaryResult, "generationTimeMs">> {
    // Calculate time breakdown
    const timeBreakdown: Record<string, number> = {};
    for (const activity of aggregated) {
      const app = activity.appName;
      timeBreakdown[app] = (timeBreakdown[app] || 0) + activity.durationMs;
    }

    // Build episode-aware activity list
    let activityList: string;
    let blockerContext = "";
    let outcomeContext = "";

    if (episodes && episodes.length > 0) {
      // Use episodes for richer context
      activityList = episodes
        .map((ep, i) => {
          const duration = this.formatDuration(ep.durationMs);
          const markers: string[] = [];
          if (ep.hasBlocker) markers.push("⚠️ blocker");
          if (ep.hasOutcome) markers.push("✅ outcome");
          const markerStr = markers.length > 0 ? ` [${markers.join(", ")}]` : "";
          return `${i + 1}. ${ep.primaryActivity} (${duration}, ${ep.frames.length} frames)${markerStr}`;
        })
        .join("\n");

      // Extract blocker/outcome episodes for explicit mention
      const blockerEpisodes = episodes.filter((ep) => ep.hasBlocker);
      const outcomeEpisodes = episodes.filter((ep) => ep.hasOutcome);

      if (blockerEpisodes.length > 0) {
        blockerContext = `\n\nBlockers encountered:\n${blockerEpisodes.map((ep) => `- ${ep.primaryActivity}`).join("\n")}`;
      }
      if (outcomeEpisodes.length > 0) {
        outcomeContext = `\n\nOutcomes achieved:\n${outcomeEpisodes.map((ep) => `- ${ep.primaryActivity}`).join("\n")}`;
      }
    } else {
      // Fallback to simple activity list
      activityList = aggregated
        .map((a) => `- ${a.activity} (${this.formatDuration(a.durationMs)})`)
        .join("\n");
    }

    // Generate summary prompt with episode context - GROUNDED PARAGRAPH VERSION
    const prompt = `You are writing a brief work session summary. Convert the activities below into a short, conversational paragraph (2-4 sentences) that a teammate would understand.

<work_episodes>
${activityList}${blockerContext}${outcomeContext}
</work_episodes>

<rules>
1. Write a natural paragraph summarizing the main activities - NOT bullet points
2. ONLY mention things that appear in the work_episodes above
3. Do NOT invent specific file names, PR numbers, or technical details unless they appear in the data
4. Group similar activities together (e.g., "worked in the terminal and chat panel")
5. Write in first person ("I worked on...", "I tested...")
6. Keep it conversational but factual
</rules>

<format>
Respond with JSON only:
{
  "narrativeSummary": "A conversational 2-4 sentence paragraph summarizing the session",
  "activities": ["Top activity 1", "Top activity 2", "Top activity 3", "Top activity 4", "Top activity 5"],
  "accomplishments": [] or ["Only if explicitly mentioned as completed/shipped/merged"],
  "blockers": [] or ["Only if explicitly mentioned as error/blocked/failed"]
}
</format>

Example good output:
{
  "narrativeSummary": "I spent the session working on monitoring session improvements, updating prompt rules and testing the summarization flow. I used the terminal to run API requests and checked the responses in the chat panel. Also made some UI tweaks along the way.",
  "activities": ["Updated prompt rules", "Tested summarization", "Ran API requests", "Checked chat responses", "Made UI tweaks"],
  "accomplishments": [],
  "blockers": []
}`;

    const completion = await this.groq.chat.completions.create({
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: SUMMARIZATION_CONFIG.TEMPERATURE,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || "";
    const parsed = this.parseJsonResponse(response);

    // Format key activities from high-confidence frames
    const keyActivities = analyses
      .filter((a) => a.confidence === "high")
      .slice(0, 5)
      .map((a) => ({
        activity: a.activity,
        timestamp: new Date(a.timestamp).toISOString(),
        confidence: a.confidence === "high" ? 0.9 : a.confidence === "medium" ? 0.7 : 0.5,
      }));

    // Enhance blockers/accomplishments from episodes if available
    let accomplishments = parsed.accomplishments || [];
    let blockers = parsed.blockers || [];

    if (episodes) {
      // Add episode-detected outcomes to accomplishments
      const episodeOutcomes = episodes
        .filter((ep) => ep.hasOutcome)
        .map((ep) => ep.primaryActivity);
      accomplishments = [...new Set([...accomplishments, ...episodeOutcomes])];

      // Add episode-detected blockers
      const episodeBlockers = episodes
        .filter((ep) => ep.hasBlocker)
        .map((ep) => ep.primaryActivity);
      blockers = [...new Set([...blockers, ...episodeBlockers])];
    }

    return {
      narrativeSummary:
        parsed.narrativeSummary || this.generateFallbackSummary(aggregated, timeBreakdown),
      activities: parsed.activities || aggregated.map((a) => a.activity).slice(0, 5),
      timeBreakdown,
      keyActivities,
      accomplishments,
      blockers,
      taskBreakdown: [],
      modelUsed: SUMMARIZATION_CONFIG.TEXT_MODEL,
      tokenCount: completion.usage?.total_tokens || 0,
    };
  }

  /**
   * Generate a fallback summary from actual session data when AI generation fails
   */
  private generateFallbackSummary(
    activities: AggregatedActivity[],
    timeBreakdown: Record<string, number>
  ): string {
    const topApp = Object.entries(timeBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0];

    const topActivity = activities[0]?.activity || "various tasks";

    return `Work session focused on ${topActivity}${topApp ? ` in ${topApp}` : ""}.`;
  }

  /**
   * Save summary to database
   */
  private async saveSummary(
    sessionId: string,
    summary: Omit<SessionSummaryResult, "generationTimeMs">,
    generationTimeMs: number
  ): Promise<void> {
    const log = createSessionLogger({ sessionId });
    const summaryHash = createContentHash(summary.narrativeSummary);

    log.debug("Saving summary to database", {
      summaryLength: summary.narrativeSummary.length,
      summaryHash,
    });

    // CRITICAL: Check for duplicate summary
    const duplicateCheck = checkDuplicateSummary(sessionId, summary.narrativeSummary);
    if (duplicateCheck.isDuplicate) {
      log.error("DUPLICATE SUMMARY DETECTED - same summary hash as another session", {
        currentSessionId: sessionId,
        previousSessionId: duplicateCheck.previousSessionId,
        summaryHash: duplicateCheck.hash,
        summaryPrefix: summary.narrativeSummary.slice(0, 150),
      });

      // Track duplicate event
      log.trackEvent(SESSION_EVENTS.DUPLICATE_DETECTED, {
        previousSessionId: duplicateCheck.previousSessionId,
        summaryHash: duplicateCheck.hash,
      });
    }

    // Get current max version
    const [latestSummary] = await db
      .select({ version: schema.sessionSummaries.version })
      .from(schema.sessionSummaries)
      .where(eq(schema.sessionSummaries.sessionId, sessionId))
      .orderBy(desc(schema.sessionSummaries.version))
      .limit(1);

    const nextVersion = (latestSummary?.version || 0) + 1;

    // Insert new summary
    await db.insert(schema.sessionSummaries).values({
      sessionId,
      version: nextVersion,
      summaryType: "auto",
      narrativeSummary: summary.narrativeSummary,
      activities: summary.activities,
      timeBreakdown: summary.timeBreakdown,
      modelUsed: summary.modelUsed,
      tokenCount: summary.tokenCount,
      generationTimeMs,
    });

    // Update session with summary
    await db
      .update(schema.monitoringSessions)
      .set({
        rawActivitySummary: summary.narrativeSummary,
        keyActivities: summary.keyActivities,
        accomplishments: summary.accomplishments,
        blockers: summary.blockers,
        timeBreakdown: summary.timeBreakdown,
        taskBreakdown: summary.taskBreakdown,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(schema.monitoringSessions.id, sessionId));

    // CHECKPOINT: Log summary save
    log.checkpoint(CHECKPOINTS.SUMMARY_SAVE, {
      version: nextVersion,
      summaryLength: summary.narrativeSummary.length,
      summaryHash,
      summaryPrefix: summary.narrativeSummary.slice(0, 150),
      activitiesCount: summary.activities.length,
      keyActivitiesCount: summary.keyActivities.length,
      accomplishmentsCount: summary.accomplishments.length,
      blockersCount: summary.blockers.length,
      tokensUsed: summary.tokenCount,
      generationTimeMs,
      isDuplicate: duplicateCheck.isDuplicate,
    });

    log.info("Summary saved", {
      version: nextVersion,
      isDuplicate: duplicateCheck.isDuplicate,
    });

    // Track analytics event
    log.trackEvent(SESSION_EVENTS.SUMMARY_GENERATED, {
      version: nextVersion,
      summaryLength: summary.narrativeSummary.length,
      activitiesCount: summary.activities.length,
      tokensUsed: summary.tokenCount,
      generationTimeMs,
    });
  }

  // Utility methods

  private batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private parseJsonResponse(response: string): any {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch (error) {
      logger.warn(
        { responsePreview: response.slice(0, 200) },
        "Failed to parse JSON response from AI"
      );
      return {};
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    }
    if (ms < 3600000) {
      return `${Math.round(ms / 60000)}m`;
    }
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Call LLM with Claude → OpenAI → DeepSeek V3.2 fallback chain
   */
  private async callLLM(prompt: string, maxTokens: number = 1000): Promise<string> {
    // Primary: Claude
    if (this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        });
        const text = response.content.find((b) => b.type === "text");
        if (text && text.type === "text" && text.text.trim()) {
          logger.info("Recap/revise via Claude Sonnet 4.5");
          return text.text.trim();
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "Claude failed for recap — falling back to OpenAI"
        );
      }
    }

    // Fallback: OpenAI
    if (this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-5",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_completion_tokens: maxTokens,
        });
        const content = completion.choices[0]?.message?.content?.trim();
        if (content) {
          logger.info("Recap/revise via OpenAI GPT-5 (fallback)");
          return content;
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "OpenAI failed for recap — falling back to DeepSeek V3.2"
        );
      }
    }

    // Last resort: DeepSeek V3.2
    if (this.deepseek) {
      const completion = await this.deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: maxTokens,
      });
      return (completion.choices[0]?.message?.content || "").trim();
    }

    // Final fallback: Groq (legacy)
    const completion = await this.groq.chat.completions.create({
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens,
    });
    return (completion.choices[0]?.message?.content || "").trim();
  }

  /**
   * Fetch user recap style memories from the user_memories table
   */
  private async fetchRecapMemories(userId: string): Promise<string[]> {
    try {
      const memories = await db
        .select({ content: schema.userMemories.content })
        .from(schema.userMemories)
        .where(
          and(
            eq(schema.userMemories.userId, userId),
            eq(schema.userMemories.category, "recap_style")
          )
        );
      return memories.map((m) => m.content);
    } catch {
      return [];
    }
  }

  /**
   * Generate a recap from multiple session summaries.
   * Uses Claude → OpenAI fallback chain.
   * Injects user style preferences from memories if userId is provided.
   */
  async generateRecap(
    sessions: Array<{
      sessionId: string;
      summary: string;
      goal?: string | null;
      durationMinutes: number;
      startTime: string;
    }>,
    tone: string = "professional",
    length: string = "standard",
    userId?: string
  ): Promise<string> {
    const sessionList = sessions
      .map((s, i) => {
        const parts = [`${i + 1}. ${s.summary}`];
        if (s.goal) parts.push(`   Goal: ${s.goal}`);
        parts.push(`   Duration: ${s.durationMinutes}m | Started: ${s.startTime}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const toneInstructions: Record<string, string> = {
      professional:
        "Use a professional, polished tone suitable for a manager or stakeholder update.",
      casual: "Use a casual, conversational tone like a Slack update to teammates.",
      concise: "Be extremely concise — bullet points and short phrases only.",
      detailed: "Be thorough and detailed, covering each session's contributions.",
    };

    const lengthInstructions: Record<string, string> = {
      brief: "Keep the recap under 100 words.",
      standard: "Keep the recap between 100-250 words.",
      comprehensive: "Write a comprehensive recap of 250-500 words covering all details.",
    };

    // Fetch user style preferences from memories
    let styleSection = "";
    if (userId) {
      const memories = await this.fetchRecapMemories(userId);
      if (memories.length > 0) {
        styleSection = `\n<user_style_preferences>\nThe user has previously specified these preferences for their recaps. Follow them closely:\n${memories.map((m, i) => `${i + 1}. ${m}`).join("\n")}\n</user_style_preferences>\n`;
      }
    }

    let graphContextSection = "";
    if (userId && config.graph.enabled) {
      try {
        const [user] = await db
          .select({ organizationId: schema.users.organizationId })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);

        if (user?.organizationId) {
          const graphContext = await graphContextBuilderService.buildForUser(
            userId,
            user.organizationId
          );
          graphContextSection = this.buildGraphContextPromptBlock(graphContext);
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error), userId },
          "Failed to load graph context for recap generation"
        );
      }
    }

    const prompt = `You are writing a work recap that combines multiple work sessions into a single update.

<sessions>
${sessionList}
</sessions>

<tone>${toneInstructions[tone] || toneInstructions.professional}</tone>
<length>${lengthInstructions[length] || lengthInstructions.standard}</length>
${styleSection}
${graphContextSection}
<instructions>
- Write in first person ("I worked on...", "I completed...")
- Combine related activities across sessions into coherent themes
- Use markdown formatting (headers, bullets, bold) for readability
- Include a brief opening line summarizing the overall period
- Group by theme/project rather than by individual session
- Only mention facts present in the session summaries above
</instructions>

Write the recap now (markdown only, no JSON wrapping):`;

    return this.callLLM(prompt, 1000);
  }

  /**
   * Revise a recap/summary based on user instructions.
   * Uses Claude → OpenAI fallback chain.
   */
  async reviseSummary(currentSummary: string, instruction: string): Promise<string> {
    const prompt = `You are an AI assistant helping to revise a work recap.

Current recap:
"""
${currentSummary}
"""

User's revision request:
"${instruction}"

Please revise the recap according to the user's request. Keep the same general structure unless the user asks for a different format.

Important:
- Maintain a professional tone
- Keep it concise unless asked to expand
- Preserve key facts and accomplishments
- Only output the revised recap text, no explanations

Revised recap:`;

    return this.callLLM(prompt, 800);
  }

  /**
   * Save a user's recap style preference as a memory.
   * Called after a user revises their recap — their instruction becomes a style memory
   * so future auto-generated recaps match their preferred format.
   */
  async saveRecapStyleMemory(userId: string, orgId: string, instruction: string): Promise<void> {
    try {
      // Check if there's already a recap_style memory for this user
      const [existing] = await db
        .select()
        .from(schema.userMemories)
        .where(
          and(
            eq(schema.userMemories.userId, userId),
            eq(schema.userMemories.category, "recap_style")
          )
        )
        .limit(1);

      if (existing) {
        // Append to existing memory content (keep history of preferences)
        const updatedContent = `${existing.content}\n${instruction}`;
        await db
          .update(schema.userMemories)
          .set({ content: updatedContent, updatedAt: new Date() })
          .where(eq(schema.userMemories.id, existing.id));
      } else {
        await db.insert(schema.userMemories).values({
          userId,
          orgId,
          category: "recap_style",
          content: instruction,
        });
      }
      logger.info({ userId }, "Saved recap style memory");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), userId },
        "Failed to save recap style memory"
      );
    }
  }

  /**
   * Refine a master story and persist the refined summary, task breakdown,
   * accomplishments, and blockers to the session record.
   * Shared by the /end route and stale-session-cleanup.
   * Falls back to the raw story if refinement fails.
   */
  async refineAndPersistSession(
    sessionId: string,
    storyResult: string | null,
    options?: { updateProgress?: boolean }
  ): Promise<{
    finalSummary: string | null;
    taskBreakdown: TaskBreakdownItem[];
    accomplishments: string[];
    blockers: string[];
  }> {
    let finalSummary = storyResult;
    let taskBreakdown: TaskBreakdownItem[] = [];
    let accomplishments: string[] = [];
    let blockers: string[] = [];

    if (storyResult) {
      try {
        if (options?.updateProgress) {
          await db
            .update(schema.monitoringSessions)
            .set({ summarizationProgress: "writing_summary" })
            .where(eq(schema.monitoringSessions.id, sessionId));
        }

        const refined = await this.refineMasterStoryForDelivery(storyResult, sessionId);
        finalSummary = refined.summary;
        taskBreakdown = refined.taskBreakdown;
        accomplishments = refined.accomplishments;
        blockers = refined.blockers;
      } catch (refineError) {
        const log = createSessionLogger({ sessionId });
        log.warn("Master story refinement failed, using raw story as fallback", {
          error: refineError instanceof Error ? refineError.message : String(refineError),
        });
      }
    }

    await db
      .update(schema.monitoringSessions)
      .set({
        status: "ready",
        summarizationProgress: null,
        ingestionStatus: "ingesting",
        ...(finalSummary ? { finalSummary } : {}),
        ...(taskBreakdown.length > 0 ? { taskBreakdown } : {}),
        ...(accomplishments.length > 0 ? { accomplishments } : {}),
        ...(blockers.length > 0 ? { blockers } : {}),
      })
      .where(eq(schema.monitoringSessions.id, sessionId));

    return { finalSummary, taskBreakdown, accomplishments, blockers };
  }

  /**
   * Re-parse a markdown summary into structured task breakdown.
   * Used when admin edits a summary — keeps task_breakdown in sync.
   */
  async parseTaskBreakdownFromSummary(
    summary: string,
    totalMinutes: number
  ): Promise<TaskBreakdownItem[]> {
    const prompt = `You are given an edited work session summary. Extract the structured tasks from it.

<summary>
${summary}
</summary>

<total_minutes>${totalMinutes}</total_minutes>

Respond with valid JSON only:
{
  "tasks": [
    { "shortTitle": "Short Label (3-4 words max)", "description": "1-3 sentence description of what was done.", "minutes": X }
  ]
}

RULES:
- Extract each distinct task/activity from the summary bullets or paragraphs.
- "shortTitle": Max 3-4 words. Concise label.
- "description": 1-3 sentences. First person, casual tone. Taken from the summary content.
- "minutes": Estimated time. If the summary includes time hints (e.g., "(15m)"), use those. Otherwise distribute total_minutes proportionally by content length.
- Minutes must sum to total_minutes.
- If the summary is a single paragraph with no clear task separation, return a single task.`;

    try {
      let raw = "";

      // Try Claude first
      if (this.anthropic) {
        try {
          const completion = await this.anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }],
          });
          raw = completion.content[0]?.type === "text" ? completion.content[0].text : "";
        } catch (claudeErr) {
          logger.warn(
            { error: claudeErr instanceof Error ? claudeErr.message : String(claudeErr) },
            "Claude task breakdown failed, trying OpenAI"
          );
        }
      }

      // Fallback to OpenAI
      if (!raw && this.openai) {
        try {
          const openaiResult = await this.openai.chat.completions.create({
            model: "gpt-5",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 2000,
          });
          raw = openaiResult.choices[0]?.message?.content || "";
        } catch (openaiErr) {
          logger.warn(
            { error: openaiErr instanceof Error ? openaiErr.message : String(openaiErr) },
            "OpenAI task breakdown failed, trying DeepSeek"
          );
        }
      }

      // Fallback to DeepSeek
      if (!raw && this.deepseek) {
        try {
          const dsResult = await this.deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 2000,
          });
          raw = dsResult.choices[0]?.message?.content || "";
        } catch (dsErr) {
          logger.warn(
            { error: dsErr instanceof Error ? dsErr.message : String(dsErr) },
            "DeepSeek task breakdown also failed"
          );
        }
      }

      if (!raw) return [];

      // Strip markdown code fences if present
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) raw = jsonMatch[1].trim();
      const parsed = JSON.parse(raw);
      const tasks: TaskBreakdownItem[] = (parsed.tasks || []).map((t: any) => ({
        shortTitle: String(t.shortTitle || "Task"),
        description: String(t.description || ""),
        minutes: Number(t.minutes) || 0,
      }));

      if (tasks.length === 0) return [];

      // Normalize minutes to sum to totalMinutes
      const sum = tasks.reduce((acc, t) => acc + t.minutes, 0);
      if (sum > 0 && Math.abs(sum - totalMinutes) > 1) {
        const ratio = totalMinutes / sum;
        let remaining = totalMinutes;
        for (let i = 0; i < tasks.length - 1; i++) {
          tasks[i].minutes = Math.round(tasks[i].minutes * ratio);
          remaining -= tasks[i].minutes;
        }
        tasks[tasks.length - 1].minutes = remaining;
      }

      return tasks;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to parse task breakdown from edited summary"
      );
      return [];
    }
  }
}

// Export singleton
export const sessionSummarizationService = new SessionSummarizationService();
