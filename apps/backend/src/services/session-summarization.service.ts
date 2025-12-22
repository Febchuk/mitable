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

// Configuration
const SUMMARIZATION_CONFIG = {
  MAX_SCREENSHOTS_TO_ANALYZE: 50, // Sample at most 50 screenshots
  VISION_BATCH_SIZE: 5, // Analyze 5 screenshots per API call
  VISION_MODEL: "gemini-2.0-flash-exp",
  TEXT_MODEL: "llama-3.1-8b-instant", // Groq's cheapest model
  TEMPERATURE: 0.3,
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
   */
  async generateSessionSummary(sessionId: string): Promise<SessionSummaryResult> {
    const startTime = Date.now();

    console.log(`[SessionSummarization] Starting summary generation for session: ${sessionId}`);

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

    // 2. Sample captures for analysis
    const sampled = this.sampleCaptures(captures);
    console.log(`[SessionSummarization] Sampled ${sampled.length} captures for analysis`);

    // 3. Analyze screenshots with Gemini Vision
    const analyses = await this.analyzeScreenshots(sampled);
    console.log(`[SessionSummarization] Analyzed ${analyses.length} screenshots`);

    // 4. Aggregate activities
    const aggregated = this.aggregateActivities(analyses);
    console.log(`[SessionSummarization] Aggregated into ${aggregated.length} activities`);

    // 5. Generate narrative summary
    const summary = await this.generateNarrative(aggregated, analyses);

    const generationTimeMs = Date.now() - startTime;
    console.log(`[SessionSummarization] Summary generated in ${generationTimeMs}ms`);

    // 6. Save summary to database
    await this.saveSummary(sessionId, summary, generationTimeMs);

    return {
      ...summary,
      generationTimeMs,
    };
  }

  /**
   * Sample captures for analysis using analysis metadata
   * Prioritizes:
   * 1. Frames with high importance scores
   * 2. Frames with delta_changed = true
   * 3. Frames marked as on_task
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

    // Prioritize frames that are already analyzed with high importance
    const analyzed = valid.filter((c) => c.analysisStatus === "analyzed");
    const pending = valid.filter((c) => c.analysisStatus === "pending");

    // Sort analyzed frames by importance score (descending)
    analyzed.sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

    // Select top frames with delta changes and on-task
    const highPriority = analyzed.filter((c) => c.deltaChanged === true && c.onTask !== false);
    const mediumPriority = analyzed.filter(
      (c) => !highPriority.includes(c) && (c.deltaChanged === true || c.onTask !== false)
    );
    const lowPriority = analyzed.filter(
      (c) => !highPriority.includes(c) && !mediumPriority.includes(c)
    );

    // Build sample: high priority first, then medium, then low, then pending
    const sampled: any[] = [];
    const addFromArray = (arr: any[], max: number) => {
      for (const item of arr) {
        if (sampled.length >= max) break;
        if (!sampled.includes(item)) {
          sampled.push(item);
        }
      }
    };

    const maxToSample = SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE;

    // Take up to 60% from high priority
    addFromArray(highPriority, Math.floor(maxToSample * 0.6));
    // Take up to 30% from medium priority
    addFromArray(mediumPriority, Math.floor(maxToSample * 0.9));
    // Fill remaining with low priority and pending
    addFromArray(lowPriority, maxToSample);
    addFromArray(pending, maxToSample);

    // Always include first and last capture for context
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
   * Aggregate activities by grouping similar ones
   */
  private aggregateActivities(analyses: ScreenshotAnalysis[]): AggregatedActivity[] {
    const grouped = new Map<string, AggregatedActivity>();

    for (const analysis of analyses) {
      // Create a key for grouping (app + simplified activity)
      const key = `${analysis.appName}:${this.simplifyActivity(analysis.activity)}`;

      if (grouped.has(key)) {
        const existing = grouped.get(key)!;
        existing.endTime = analysis.timestamp;
        existing.durationMs = existing.endTime - existing.startTime;
        existing.occurrences++;
      } else {
        grouped.set(key, {
          activity: analysis.activity,
          appName: analysis.appName,
          startTime: analysis.timestamp,
          endTime: analysis.timestamp,
          durationMs: 0,
          occurrences: 1,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.startTime - b.startTime);
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
   */
  private async generateNarrative(
    aggregated: AggregatedActivity[],
    analyses: ScreenshotAnalysis[]
  ): Promise<Omit<SessionSummaryResult, "generationTimeMs">> {
    // Calculate time breakdown
    const timeBreakdown: Record<string, number> = {};
    for (const activity of aggregated) {
      const app = activity.appName;
      timeBreakdown[app] = (timeBreakdown[app] || 0) + activity.durationMs;
    }

    // Format activities for the prompt
    const activityList = aggregated
      .map((a) => `- ${a.activity} (${this.formatDuration(a.durationMs)})`)
      .join("\n");

    // Generate summary prompt
    const prompt = `You're writing a casual update to share with your team about what you got done in this work session.

Activities detected:
${activityList}

Write a brief, conversational summary (6 sentences max) that:
1. Highlights what you accomplished and why it matters
2. Connects activities to outcomes when possible (e.g., "Fixed X which unblocked Y")
3. Feels human and natural - like you're messaging your team in Slack
4. Written in first person

Style guidelines:
- Be casual and conversational (not formal or robotic)
- Focus on impact and outcomes, not just tasks
- Skip unnecessary details like durations or tool names
- Mention specific artifacts when relevant (PRs, tickets, documents)

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

    // Format key activities
    const keyActivities = analyses
      .filter((a) => a.confidence === "high")
      .slice(0, 5)
      .map((a) => ({
        activity: a.activity,
        timestamp: new Date(a.timestamp).toISOString(),
        confidence: a.confidence === "high" ? 0.9 : a.confidence === "medium" ? 0.7 : 0.5,
      }));

    return {
      narrativeSummary: parsed.narrativeSummary || "Work session completed.",
      activities: parsed.activities || aggregated.map((a) => a.activity).slice(0, 5),
      timeBreakdown,
      keyActivities,
      accomplishments: parsed.accomplishments || [],
      blockers: parsed.blockers || [],
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
