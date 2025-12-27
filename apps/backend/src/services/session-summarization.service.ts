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
    const startTime = Date.now();

    console.log(`[SessionSummarization] Starting summary generation for session: ${sessionId}`);

    // 1. Try to use master story (primary path)
    const masterStory = await masterStoryService.getCurrentStory(sessionId);

    if (masterStory && masterStory.length >= 50) {
      console.log(
        `[SessionSummarization] Using master story for final summary (${masterStory.length} chars)`
      );
      return await this.generateSummaryFromMasterStory(sessionId, masterStory, startTime);
    }

    // 2. Fallback to batch analysis if master story unavailable
    console.warn(
      `[SessionSummarization] Master story unavailable or too short (${masterStory?.length || 0} chars), falling back to batch screenshot analysis`
    );
    return await this.generateSummaryFromScreenshots(sessionId, startTime);
  }

  /**
   * Generate summary from master story (primary path)
   * Much faster and cheaper than re-analyzing screenshots
   */
  private async generateSummaryFromMasterStory(
    sessionId: string,
    masterStory: string,
    startTime: number
  ): Promise<SessionSummaryResult> {
    // Get session for metadata
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Get key activities from frame metadata (already analyzed)
    const keyActivities = await this.getKeyActivitiesFromFrames(sessionId);

    // Optionally refine the master story for delivery
    const refinedSummary = await this.refineMasterStoryForDelivery(masterStory);

    const generationTimeMs = Date.now() - startTime;
    console.log(
      `[SessionSummarization] Summary generated from master story in ${generationTimeMs}ms`
    );

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
    startTime: number
  ): Promise<SessionSummaryResult> {
    // 1. Get session and captures from database
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const captures = await db
      .select()
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, sessionId))
      .orderBy(schema.sessionCaptures.sequenceNumber);

    console.log(`[SessionSummarization] Found ${captures.length} captures`);

    // 2. Sample captures for analysis (with temporal coverage)
    const sampled = this.sampleCaptures(captures);
    console.log(`[SessionSummarization] Sampled ${sampled.length} captures for analysis`);

    // 3. Analyze screenshots with Gemini Vision
    const analyses = await this.analyzeScreenshots(sampled);
    console.log(`[SessionSummarization] Analyzed ${analyses.length} screenshots`);

    // 4. Build episodes from analyses (time-aware segmentation)
    const episodes = this.buildEpisodes(analyses, sampled);
    console.log(`[SessionSummarization] Segmented into ${episodes.length} episodes`);

    // 5. Convert episodes to activities for narrative generation
    const aggregated = this.episodesToActivities(episodes);
    console.log(`[SessionSummarization] Aggregated into ${aggregated.length} activities`);

    // 6. Generate narrative summary with episode context
    const summary = await this.generateNarrative(aggregated, analyses, episodes);

    const generationTimeMs = Date.now() - startTime;
    console.log(
      `[SessionSummarization] Summary generated from screenshots in ${generationTimeMs}ms`
    );

    // 6. Save summary to database
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
  private async refineMasterStoryForDelivery(masterStory: string): Promise<{
    summary: string;
    activities: string[];
    accomplishments: string[];
    blockers: string[];
    tokenCount: number;
  }> {
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

    const completion = await this.groq.chat.completions.create({
      model: SUMMARIZATION_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    const response = completion.choices[0]?.message?.content || "";
    const parsed = this.parseJsonResponse(response);

    return {
      summary: parsed.summary || masterStory,
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

    console.log(
      `[SessionSummarization] Temporal coverage: ${sampled.length} frames from ${timeBuckets.size} time buckets`
    );

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
        console.error("[SessionSummarization] Batch analysis failed:", error);
        // Continue with other batches
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
        console.error(`[SessionSummarization] Failed to analyze capture ${capture.id}:`, error);
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

    console.log(
      `[SessionSummarization] Built ${episodes.length} episodes from ${analyses.length} frames`
    );
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

Example tone:
"Merged the auth refactor PR and cut a release today. This unblocks the team to start testing the new login flow. Also responded to a few customer support tickets about the password reset issue."

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
      narrativeSummary: parsed.narrativeSummary || "Work session completed.",
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
   * Save summary to database
   */
  private async saveSummary(
    sessionId: string,
    summary: Omit<SessionSummaryResult, "generationTimeMs">,
    generationTimeMs: number
  ): Promise<void> {
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

    console.log(`[SessionSummarization] Summary saved (version ${nextVersion})`);
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
      console.error("[SessionSummarization] Failed to parse JSON response:", response);
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
