/**
 * Workstream RLM Service
 *
 * Periodic RLM-based workstream detection and grouping.
 * Analyzes captures semantically and groups them into logical workstreams.
 */

import Groq from "groq-sdk";
import { EventEmitter } from "events";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, isNull, asc } from "drizzle-orm";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import {
  getWorkstreamSystemPrompt,
  getWorkstreamUserPrompt,
  parseWorkstreamAnalysisResponse,
  type WorkstreamAnalysisResult,
} from "./rlm/workstream-rlm-prompts.js";
import type { WorkstreamCategory, AnalysisTriggerReason } from "../db/schema/workstreams.schema.js";

// Color palette for workstreams
const WORKSTREAM_COLORS = ["violet", "blue", "pink", "emerald", "amber", "cyan"];

/**
 * Analysis state for a session
 */
interface AnalysisState {
  sessionId: string;
  lastAnalysisAt: number;
  lastAnalysisNumber: number;
  capturesSinceLastAnalysis: number;
  lastCaptureAppCategory: string | null;
  isAnalyzing: boolean;
  colorIndex: number;
}

/**
 * Capture data for analysis
 */
interface CaptureData {
  id: string;
  capturedAt: Date;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
  workstreamId: string | null;
}

/**
 * Workstream update event
 */
export interface WorkstreamUpdateEvent {
  sessionId: string;
  workstreams: schema.SessionWorkstream[];
  analysisNumber: number;
  timestamp: number;
}

/**
 * Configuration for RLM triggers
 */
const CONFIG = {
  captureThreshold: 10,      // Trigger after 10 new captures
  timeThresholdMs: 180000,   // Trigger after 3 minutes (180000ms)
  minIntervalMs: 60000,      // Minimum 60s between analyses (debounce)
  model: "llama-3.3-70b-versatile", // Groq model for analysis (upgraded from decommissioned 3.1)
  maxTokens: 2000,
  temperature: 0.2,
};

/**
 * Determine app category for context switch detection
 */
function getAppCategory(appName: string | null): string {
  if (!appName) return "unknown";
  const app = appName.toLowerCase();

  if (["slack", "teams", "mail", "outlook", "messages", "discord"].some(c => app.includes(c))) {
    return "communication";
  }
  if (["zoom", "meet", "webex", "facetime"].some(m => app.includes(m))) {
    return "meeting";
  }
  if (["code", "vscode", "intellij", "webstorm", "terminal", "iterm"].some(d => app.includes(d))) {
    return "development";
  }
  if (["figma", "sketch", "xd", "photoshop"].some(d => app.includes(d))) {
    return "design";
  }
  if (["chrome", "firefox", "safari", "edge", "arc"].some(b => app.includes(b))) {
    return "browser";
  }

  return "other";
}

/**
 * Workstream RLM Service
 */
class WorkstreamRLMService extends EventEmitter {
  private groq: Groq;
  private analysisStates = new Map<string, AnalysisState>();
  private analysisQueue = new Map<string, Promise<void>>();

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Get or create analysis state for a session
   */
  private getOrCreateState(sessionId: string): AnalysisState {
    if (!this.analysisStates.has(sessionId)) {
      this.analysisStates.set(sessionId, {
        sessionId,
        lastAnalysisAt: 0,
        lastAnalysisNumber: 0,
        capturesSinceLastAnalysis: 0,
        lastCaptureAppCategory: null,
        isAnalyzing: false,
        colorIndex: 0,
      });
    }
    return this.analysisStates.get(sessionId)!;
  }

  /**
   * Called after each capture is stored
   */
  async onCaptureAdded(sessionId: string, capture: CaptureData): Promise<void> {
    const state = this.getOrCreateState(sessionId);
    state.capturesSinceLastAnalysis++;

    const currentCategory = getAppCategory(capture.appName);
    const triggerReason = this.checkTrigger(state, currentCategory);

    state.lastCaptureAppCategory = currentCategory;

    if (triggerReason) {
      logger.info({ sessionId, triggerReason, capturesSince: state.capturesSinceLastAnalysis },
        "[WorkstreamRLM] Trigger detected");

      // Queue analysis (non-blocking)
      this.queueAnalysis(sessionId, triggerReason).catch(err => {
        logger.error({ sessionId, error: err.message }, "[WorkstreamRLM] Analysis failed");
      });
    }
  }

  /**
   * Check if analysis should be triggered
   */
  private checkTrigger(state: AnalysisState, currentCategory: string): AnalysisTriggerReason | null {
    if (state.isAnalyzing) return null;

    const elapsed = Date.now() - state.lastAnalysisAt;
    if (elapsed < CONFIG.minIntervalMs) return null;

    // Trigger conditions
    if (state.capturesSinceLastAnalysis >= CONFIG.captureThreshold) {
      return "capture_threshold";
    }

    if (state.lastAnalysisAt > 0 && elapsed >= CONFIG.timeThresholdMs) {
      return "time_threshold";
    }

    // Context switch: dev <-> communication, meeting starts, etc.
    if (state.lastCaptureAppCategory &&
        state.lastCaptureAppCategory !== currentCategory &&
        (currentCategory === "communication" || currentCategory === "meeting" ||
         state.lastCaptureAppCategory === "communication" || state.lastCaptureAppCategory === "meeting")) {
      return "context_switch";
    }

    return null;
  }

  /**
   * Queue an analysis (prevents concurrent analyses for same session)
   */
  private async queueAnalysis(sessionId: string, triggerReason: AnalysisTriggerReason, forceMode?: boolean): Promise<void> {
    // Wait for any existing analysis to complete
    if (this.analysisQueue.has(sessionId)) {
      await this.analysisQueue.get(sessionId);
    }

    const promise = this.runAnalysis(sessionId, triggerReason, forceMode);
    this.analysisQueue.set(sessionId, promise);

    try {
      await promise;
    } finally {
      this.analysisQueue.delete(sessionId);
    }
  }

  /**
   * Force immediate analysis (e.g., when user opens timeline view)
   * When force=true, clears existing workstreams and re-analyzes ALL captures
   */
  async forceAnalysis(sessionId: string, options?: { force?: boolean }): Promise<void> {
    const state = this.getOrCreateState(sessionId);

    // If force mode, clear existing workstreams and reset state
    if (options?.force) {
      logger.info({ sessionId }, "[WorkstreamRLM] Force mode: clearing existing workstreams");
      await this.clearExistingWorkstreams(sessionId);
      state.lastAnalysisNumber = 0; // Treat as first analysis (fetch ALL captures)
      state.capturesSinceLastAnalysis = 0;
    }

    await this.queueAnalysis(sessionId, "manual", options?.force);
  }

  /**
   * Clear all existing workstreams and their assignments for a session
   * Used when doing a full re-analysis in force mode
   */
  private async clearExistingWorkstreams(sessionId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Clear workstream assignments from all captures
      await tx
        .update(schema.sessionCaptures)
        .set({
          workstreamId: null,
          workstreamProvisional: true,
        })
        .where(eq(schema.sessionCaptures.sessionId, sessionId));

      // 2. Delete all workstreams for this session
      await tx
        .delete(schema.sessionWorkstreams)
        .where(eq(schema.sessionWorkstreams.sessionId, sessionId));
    });

    logger.info({ sessionId }, "[WorkstreamRLM] Cleared all existing workstreams");
  }

  /**
   * Run RLM analysis for a session
   * When forceMode=true, fetches ALL captures regardless of previous assignments
   */
  private async runAnalysis(sessionId: string, triggerReason: AnalysisTriggerReason, forceMode?: boolean): Promise<void> {
    const state = this.getOrCreateState(sessionId);
    state.isAnalyzing = true;
    const startTime = Date.now();

    try {
      // 1. Fetch session
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, sessionId))
        .limit(1);

      // Allow analysis for ended sessions too (for regeneration)
      if (!session) {
        logger.debug({ sessionId }, "[WorkstreamRLM] Session not found, skipping");
        return;
      }

      if (session.status === "deleted") {
        logger.debug({ sessionId, status: session.status }, "[WorkstreamRLM] Session deleted, skipping");
        return;
      }

      // 2. Fetch ALL captures for this session
      // RLM should always reconsider all data holistically, not incrementally
      // This ensures semantic grouping can see relationships across all activities
      logger.info({ sessionId, forceMode, lastAnalysisNumber: state.lastAnalysisNumber },
        "[WorkstreamRLM] Fetching ALL captures for holistic analysis");

      const captures = await db
        .select({
          id: schema.sessionCaptures.id,
          capturedAt: schema.sessionCaptures.capturedAt,
          appName: schema.sessionCaptures.appName,
          windowTitle: schema.sessionCaptures.windowTitle,
          activityDescription: schema.sessionCaptures.activityDescription,
          workstreamId: schema.sessionCaptures.workstreamId,
        })
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, sessionId))
        .orderBy(asc(schema.sessionCaptures.sequenceNumber));

      if (captures.length === 0) {
        logger.debug({ sessionId }, "[WorkstreamRLM] No new captures to analyze");
        return;
      }

      // 3. Fetch existing workstreams
      const existingWorkstreams = await db
        .select()
        .from(schema.sessionWorkstreams)
        .where(
          and(
            eq(schema.sessionWorkstreams.sessionId, sessionId),
            isNull(schema.sessionWorkstreams.isMergedInto)
          )
        );

      // 4. Calculate session duration
      const sessionStart = session.startedAt;
      const now = new Date();
      const durationMinutes = Math.round((now.getTime() - sessionStart.getTime()) / (1000 * 60));

      // 5. Build and send RLM prompt
      const analysisNumber = state.lastAnalysisNumber + 1;

      const systemPrompt = getWorkstreamSystemPrompt();
      const userPrompt = getWorkstreamUserPrompt(
        captures.map(c => ({
          id: c.id,
          capturedAt: c.capturedAt.toISOString(),
          appName: c.appName,
          windowTitle: c.windowTitle,
          activityDescription: c.activityDescription,
        })),
        existingWorkstreams.map(w => ({
          id: w.id,
          name: w.name,
          captureCount: w.captureCount,
          appsUsed: w.appsUsed || [],
          summary: w.summary,
          category: w.category,
        })),
        {
          sessionId,
          linearIssueTitle: session.linearIssueTitle,
          durationMinutes,
          analysisNumber,
        }
      );

      logger.debug({ sessionId, captureCount: captures.length, existingWorkstreams: existingWorkstreams.length },
        "[WorkstreamRLM] Calling LLM");

      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: CONFIG.model,
        temperature: CONFIG.temperature,
        max_tokens: CONFIG.maxTokens,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from LLM");
      }

      // 6. Parse response
      const analysisResult = parseWorkstreamAnalysisResponse(content);

      // 7. Apply updates to database
      const updates = await this.applyAnalysisResults(sessionId, analysisResult, state);

      // 8. Log analysis
      const executionTimeMs = Date.now() - startTime;
      await db.insert(schema.workstreamAnalysisLog).values({
        sessionId,
        analysisNumber,
        triggerReason,
        capturesAnalyzed: captures.length,
        modelUsed: CONFIG.model,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        executionTimeMs,
        workstreamsCreated: updates.created,
        workstreamsMerged: updates.merged,
        capturesReassigned: updates.assigned,
        success: true,
      });

      // 9. Update state
      state.lastAnalysisAt = Date.now();
      state.lastAnalysisNumber = analysisNumber;
      state.capturesSinceLastAnalysis = 0;

      // 10. Emit update event for WebSocket
      const updatedWorkstreams = await db
        .select()
        .from(schema.sessionWorkstreams)
        .where(
          and(
            eq(schema.sessionWorkstreams.sessionId, sessionId),
            isNull(schema.sessionWorkstreams.isMergedInto)
          )
        );

      this.emit("workstreamsUpdated", {
        sessionId,
        workstreams: updatedWorkstreams,
        analysisNumber,
        timestamp: Date.now(),
      } as WorkstreamUpdateEvent);

      logger.info({
        sessionId,
        analysisNumber,
        capturesAnalyzed: captures.length,
        workstreamsCreated: updates.created,
        workstreamsMerged: updates.merged,
        capturesAssigned: updates.assigned,
        executionTimeMs,
      }, "[WorkstreamRLM] Analysis completed");

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Log failure
      await db.insert(schema.workstreamAnalysisLog).values({
        sessionId,
        analysisNumber: state.lastAnalysisNumber + 1,
        triggerReason,
        modelUsed: CONFIG.model,
        executionTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error({ sessionId, error: error instanceof Error ? error.message : String(error) },
        "[WorkstreamRLM] Analysis failed");

      throw error;
    } finally {
      state.isAnalyzing = false;
    }
  }

  /**
   * Apply analysis results to database
   */
  private async applyAnalysisResults(
    sessionId: string,
    result: WorkstreamAnalysisResult,
    state: AnalysisState
  ): Promise<{ created: number; merged: number; assigned: number }> {
    let created = 0;
    let merged = 0;
    let assigned = 0;

    // Map from tempId to real ID for new workstreams
    const tempIdToRealId = new Map<string, string>();

    await db.transaction(async (tx) => {
      // 1. Create new workstreams
      for (const newWs of result.newWorkstreams) {
        const color = WORKSTREAM_COLORS[state.colorIndex % WORKSTREAM_COLORS.length];
        state.colorIndex++;

        const [inserted] = await tx
          .insert(schema.sessionWorkstreams)
          .values({
            sessionId,
            name: newWs.name,
            color,
            category: newWs.category as WorkstreamCategory,
            summary: newWs.summary,
            isProvisional: true,
          })
          .returning();

        tempIdToRealId.set(newWs.tempId, inserted.id);
        created++;
      }

      // 2. Apply merges
      for (const merge of result.merges) {
        // Resolve IDs (might be temp IDs for new workstreams)
        const resolvedIntoId = merge.intoId.startsWith("NEW:")
          ? tempIdToRealId.get(merge.intoId)
          : merge.intoId;

        const resolvedFromId = merge.fromId.startsWith("NEW:")
          ? tempIdToRealId.get(merge.fromId)
          : merge.fromId;

        // Skip if we can't resolve the IDs
        if (!resolvedIntoId || !resolvedFromId) {
          logger.warn({ merge, resolvedIntoId, resolvedFromId },
            "[WorkstreamRLM] Skipping merge - could not resolve IDs");
          continue;
        }

        await tx
          .update(schema.sessionWorkstreams)
          .set({
            isMergedInto: resolvedIntoId,
            updatedAt: new Date(),
          })
          .where(eq(schema.sessionWorkstreams.id, resolvedFromId));

        // Reassign captures from merged workstream
        await tx
          .update(schema.sessionCaptures)
          .set({ workstreamId: resolvedIntoId })
          .where(eq(schema.sessionCaptures.workstreamId, resolvedFromId));

        merged++;
      }

      // 3. Apply updates to existing workstreams
      for (const [wsId, updates] of Object.entries(result.updates)) {
        // Resolve ID (might be temp ID for new workstream)
        const resolvedWsId = wsId.startsWith("NEW:")
          ? tempIdToRealId.get(wsId)
          : wsId;

        if (!resolvedWsId) {
          logger.warn({ wsId }, "[WorkstreamRLM] Skipping update - could not resolve ID");
          continue;
        }

        await tx
          .update(schema.sessionWorkstreams)
          .set({
            ...(updates.name && { name: updates.name }),
            ...(updates.summary && { summary: updates.summary }),
            ...(updates.category && { category: updates.category as WorkstreamCategory }),
            updatedAt: new Date(),
          })
          .where(eq(schema.sessionWorkstreams.id, resolvedWsId));
      }

      // 4. Assign captures to workstreams
      for (const [captureId, workstreamRef] of Object.entries(result.assignments)) {
        // Resolve workstream ID (might be temp ID for new workstream)
        const workstreamId = workstreamRef.startsWith("NEW:")
          ? tempIdToRealId.get(workstreamRef)
          : workstreamRef;

        if (workstreamId) {
          await tx
            .update(schema.sessionCaptures)
            .set({
              workstreamId,
              workstreamProvisional: false,
            })
            .where(eq(schema.sessionCaptures.id, captureId));

          assigned++;
        }
      }

      // 5. Update workstream stats (capture count, apps used, duration)
      const workstreamIds = new Set([
        ...Object.values(result.assignments).map(ref =>
          ref.startsWith("NEW:") ? tempIdToRealId.get(ref) : ref
        ).filter(Boolean),
        ...result.merges.map(m =>
          m.intoId.startsWith("NEW:") ? tempIdToRealId.get(m.intoId) : m.intoId
        ).filter(Boolean),
      ]);

      for (const wsId of workstreamIds) {
        if (!wsId) continue;

        // Get all captures for this workstream
        const captures = await tx
          .select({
            appName: schema.sessionCaptures.appName,
            capturedAt: schema.sessionCaptures.capturedAt,
          })
          .from(schema.sessionCaptures)
          .where(eq(schema.sessionCaptures.workstreamId, wsId))
          .orderBy(asc(schema.sessionCaptures.capturedAt));

        if (captures.length > 0) {
          const apps = [...new Set(captures.map(c => c.appName).filter(Boolean) as string[])];
          const firstCapture = captures[0].capturedAt;
          const lastCapture = captures[captures.length - 1].capturedAt;
          const durationMinutes = Math.max(1, Math.round(
            (lastCapture.getTime() - firstCapture.getTime()) / (1000 * 60)
          ));

          await tx
            .update(schema.sessionWorkstreams)
            .set({
              captureCount: captures.length,
              appsUsed: apps,
              totalDurationMinutes: durationMinutes,
              lastAnalysisAt: new Date(),
            })
            .where(eq(schema.sessionWorkstreams.id, wsId));
        }
      }
    });

    return { created, merged, assigned };
  }

  /**
   * Clean up state when session ends
   */
  cleanupSession(sessionId: string): void {
    this.analysisStates.delete(sessionId);
  }
}

export const workstreamRLMService = new WorkstreamRLMService();
