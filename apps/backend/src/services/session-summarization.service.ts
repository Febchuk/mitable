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
    const summary = await this.generateNarrative(session, aggregated, analyses);

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
   * Sample captures for analysis (skip duplicates, ensure coverage)
   */
  private sampleCaptures(captures: any[]): any[] {
    if (captures.length <= SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE) {
      return captures;
    }

    // Filter out duplicates first
    const unique = captures.filter((c) => c.analysisStatus !== "duplicate");

    if (unique.length <= SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE) {
      return unique;
    }

    // Sample evenly across the session
    const step = Math.floor(unique.length / SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE);
    const sampled: any[] = [];

    for (let i = 0; i < unique.length && sampled.length < SUMMARIZATION_CONFIG.MAX_SCREENSHOTS_TO_ANALYZE; i += step) {
      sampled.push(unique[i]);
    }

    // Always include the last capture
    const lastCapture = unique[unique.length - 1];
    if (!sampled.includes(lastCapture)) {
      sampled.push(lastCapture);
    }

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
   */
  private async analyzeBatch(captures: any[]): Promise<ScreenshotAnalysis[]> {
    const analyses: ScreenshotAnalysis[] = [];

    // For each capture in the batch, analyze individually (simpler and more reliable)
    for (const capture of captures) {
      try {
        // Check if screenshot file exists
        if (!capture.screenshotPath) {
          // Generate analysis from metadata only
          analyses.push({
            captureId: capture.id,
            sequenceNumber: capture.sequenceNumber,
            timestamp: new Date(capture.capturedAt).getTime(),
            appName: capture.appName || "Unknown",
            windowTitle: capture.windowTitle || "",
            activity: this.inferActivityFromMetadata(capture),
            context: [],
            confidence: "low",
          });
          continue;
        }

        // Read screenshot file
        let imageData: string;
        try {
          const buffer = await fs.readFile(capture.screenshotPath);
          imageData = buffer.toString("base64");
        } catch (fileError) {
          // File may have been cleaned up
          analyses.push({
            captureId: capture.id,
            sequenceNumber: capture.sequenceNumber,
            timestamp: new Date(capture.capturedAt).getTime(),
            appName: capture.appName || "Unknown",
            windowTitle: capture.windowTitle || "",
            activity: this.inferActivityFromMetadata(capture),
            context: [],
            confidence: "low",
          });
          continue;
        }

        // Analyze with Gemini Vision
        const prompt = `Analyze this screenshot and describe what the user is doing in 10-15 words.
Focus on the ACTIVITY, not the UI elements.

Examples of good responses:
- "Editing TypeScript code in VS Code, working on a React component"
- "Browsing GitHub pull request #42, reviewing code changes"
- "Writing email in Gmail to team about project update"
- "Slack conversation in #engineering channel about deployment"

Respond with JSON:
{
  "activity": "Brief description of what user is doing",
  "context": ["key item 1", "key item 2"],
  "confidence": "high" | "medium" | "low"
}`;

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
            confidence: parsed.confidence === "high" ? "0.9" : parsed.confidence === "medium" ? "0.7" : "0.5",
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
          activity: this.inferActivityFromMetadata(capture),
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

    if (app.toLowerCase().includes("chrome") || app.toLowerCase().includes("firefox") || app.toLowerCase().includes("safari")) {
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
    session: any,
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
    const prompt = `You are summarizing a work session for an employee's status update.

Session Duration: ${this.formatDuration(Date.now() - new Date(session.startedAt).getTime())}
Session Name: ${session.name || "Work Session"}

Activities detected:
${activityList}

Generate a concise, professional summary in 2-3 sentences that:
1. Highlights the main focus areas
2. Mentions key accomplishments if apparent
3. Notes any context switches between apps

Also extract:
- Top 3 key activities (most significant things done)
- Any accomplishments (completed items, shipped features, etc.)
- Any potential blockers (waiting, errors, repeated attempts)

Respond with JSON:
{
  "narrativeSummary": "Your 2-3 sentence summary here",
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
}

// Export singleton
export const sessionSummarizationService = new SessionSummarizationService();
