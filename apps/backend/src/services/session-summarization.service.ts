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
import { promises as fs } from "fs";
import { config } from "../config";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, desc } from "drizzle-orm";
import { masterStoryService } from "./master-story.service";
import {
  createSessionLogger,
  createContentHash,
  createTimer,
  checkDuplicateSummary,
  CHECKPOINTS,
  SESSION_EVENTS,
} from "../lib/sessionLogger";
import { logger } from "../lib/logger";

// Configuration
const SUMMARIZATION_CONFIG = {
  MAX_SCREENSHOTS_TO_ANALYZE: 50, // Sample at most 50 screenshots
  VISION_BATCH_SIZE: 5, // Analyze 5 screenshots per API call
  VISION_MODEL: "gemini-2.0-flash-exp",
  TEXT_MODEL: "llama-3.1-8b-instant", // Groq's cheapest model
  TEMPERATURE: 0.3,
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

interface SessionSummaryResult {
  narrativeSummary: string;
  activities: string[];
  timeBreakdown: Record<string, number>;
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

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.visionModel = this.genAI.getGenerativeModel({
      model: SUMMARIZATION_CONFIG.VISION_MODEL,
    });
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Generate a complete summary for a monitoring session
   * Primary path: Use master story (built in real-time)
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
  private async refineMasterStoryForDelivery(
    masterStory: string,
    sessionId: string
  ): Promise<{
    summary: string;
    activities: string[];
    accomplishments: string[];
    blockers: string[];
    tokenCount: number;
  }> {
    const log = createSessionLogger({ sessionId });
    const inputHash = createContentHash(masterStory);

    log.debug("Refining master story for delivery", {
      inputLength: masterStory.length,
      inputHash,
    });

    // Use Groq to extract structured data from the master story
    const prompt = `<task>
Extract structured information from a work session narrative written in first person. Transform the detailed narrative into a concise, delivery-ready summary with key insights.
</task>

<input>
<master_story>
${masterStory}
</master_story>
</input>

<instructions>
<summary_requirements>
- Length: Under 10 sentences
- Style: Casual first person (like a Slack update)
- Focus: Accomplishments and outcomes, not process details
- Tone: Conversational and natural
- Content: Highlight what was achieved and why it matters
</summary_requirements>

<activities_requirements>
- Count: Top 3-5 key activities
- Format: Short phrases describing what was actually done
- Focus: Concrete actions, not tools or technical details
- Examples: "Fixed login bug", "Merged PR #42", "Reviewed customer tickets"
</activities_requirements>

<accomplishments_requirements>
- Include: Completed items, shipped features, unblocked work
- Format: Short, specific descriptions
- Examples: "Deployed payment service fix", "Merged auth refactor PR", "Resolved production timeout issue"
- If none: Return empty array []
</accomplishments_requirements>

<blockers_requirements>
- Include: Waiting states, errors, repeated attempts, blocked progress
- Format: Short descriptions of what blocked progress
- Examples: "OAuth integration timeout", "Waiting on API credentials", "Test failures blocking merge"
- If none: Return empty array []
</blockers_requirements>
</instructions>

<output_format>
Respond with valid JSON only:
{
  "summary": "Refined casual summary here (under 10 sentences, first person)",
  "activities": ["Activity 1", "Activity 2", "Activity 3"],
  "accomplishments": ["Accomplishment 1"] or [],
  "blockers": ["Blocker 1"] or []
}
</output_format>`;

    // Log AI prompt for debugging
    log.logAIInteraction("refinement_prompt", prompt, undefined, {
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      inputHash,
    });

    const completion = await this.groq.chat.completions.create({
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    const response = completion.choices[0]?.message?.content || "";
    const parsed = this.parseJsonResponse(response);

    const outputSummary = parsed.summary || masterStory;
    const outputHash = createContentHash(outputSummary);

    // Log AI response for debugging
    log.logAIInteraction("refinement_response", "", response, {
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      inputHash,
      outputHash,
      tokensUsed: completion.usage?.total_tokens,
      parsedSuccessfully: !!parsed.summary,
    });

    log.debug("Master story refined", {
      inputHash,
      outputHash,
      outputLength: outputSummary.length,
      activitiesCount: (parsed.activities || []).length,
    });

    return {
      summary: outputSummary,
      activities: parsed.activities || [],
      accomplishments: parsed.accomplishments || [],
      blockers: parsed.blockers || [],
      tokenCount: completion.usage?.total_tokens || 0,
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

    // Generate summary prompt with episode context
    const prompt = `You're writing a casual update to share with your team about what you got done in this work session.

Work episodes (in chronological order):
${activityList}${blockerContext}${outcomeContext}

Write a brief, conversational summary (6 sentences max) that:
1. Highlights what you accomplished and why it matters
2. Connects activities to outcomes when possible (e.g., "Fixed X which unblocked Y")
3. Feels human and natural - like you're messaging your team in Slack
4. Written in first person
5. If blockers were encountered, mention them naturally
6. If outcomes were achieved (merged, deployed, sent), highlight them

Style guidelines:
- Be casual and conversational (not formal or robotic)
- Focus on impact and outcomes, not just tasks
- Skip unnecessary details like durations or tool names
- Mention specific artifacts when relevant (PRs, tickets, documents)
- Connect the dots between episodes when there's a logical flow

Example summaries (match this tone and structure):

"Wrapped up the dashboard redesign and pushed it to staging. Design team can now review before next sprint. Also knocked out a few bug fixes from the backlog."

"Spent most of the session debugging the payment flow - found the issue was a missing null check. Shipped the fix and verified in production."

"Deep work on the API documentation today. Got through the auth endpoints and started on webhooks. Should finish tomorrow."

Also extract:
- Top 3 key activities (what you actually accomplished)
- Any accomplishments (completed items, shipped features, unblocked work)
- Any blockers (waiting on something, errors, repeated attempts)

Respond with JSON:
{
  "narrativeSummary": "Your casual 2-4 sentence update here",
  "activities": ["Activity 1", "Activity 2", "Activity 3"],
  "accomplishments": ["Accomplishment 1"] or [],
  "blockers": ["Blocker 1"] or []
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
   * Revise a summary based on user instructions
   */
  async reviseSummary(currentSummary: string, instruction: string): Promise<string> {
    const prompt = `You are an AI assistant helping to revise a work session summary.

Current summary:
"""
${currentSummary}
"""

User's revision request:
"${instruction}"

Please revise the summary according to the user's request. Keep the same general structure unless the user asks for a different format.

Important:
- Maintain a professional tone
- Keep it concise unless asked to expand
- Preserve key facts and accomplishments
- Only output the revised summary text, no explanations

Revised summary:`;

    const completion = await this.groq.chat.completions.create({
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 800,
    });

    const response = completion.choices[0]?.message?.content || "";
    return response.trim();
  }
}

// Export singleton
export const sessionSummarizationService = new SessionSummarizationService();
