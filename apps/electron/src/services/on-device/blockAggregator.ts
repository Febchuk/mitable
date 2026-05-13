/**
 * Block Aggregator
 *
 * Runs the Block Analyzer RLM after each session to produce structured
 * activity blocks with client/topic attribution, then rolls up daily summaries.
 *
 * Flow:
 *   1. Load session data from PGlite + block.md from disk
 *   2. Query past activity_blocks for known client names
 *   3. Run Block Analyzer RLM (iterative tool loop via BYOK provider)
 *   4. Write emitted blocks to PGlite activity_blocks table
 *   5. Rebuild daily summary from all blocks for that date
 *
 * Falls back to a lightweight numeric grouping if no BYOK provider
 * is available (captures + classifications only, no client attribution).
 */

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { BrowserWindow } from "electron";
import { pgDb } from "./pgDb";
import type { LocalClassification, LocalCapture } from "./pgDb";
import { createLogger } from "../../lib/logger";
import { runRLMLoop, type CompletionFn } from "./rlm/local-rlm-engine";
import {
  BlockAnalyzerEnvironment,
  type EmittedBlock,
  type KnownClient,
} from "./rlm/block-analyzer-rlm-environment";
import { BLOCK_ANALYZER_TOOLS } from "./rlm/block-analyzer-rlm-tools";
import {
  getBlockAnalyzerSystemPrompt,
  getBlockAnalyzerUserPrompt,
} from "./rlm/block-analyzer-rlm-prompts";

const logger = createLogger("BlockAggregator");

const MIN_BLOCK_DURATION_MS = 30_000;

function dateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Known Clients from Past Blocks ──────────────────────────────────────────

async function loadKnownClients(userId: string): Promise<KnownClient[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = dateKeyFromMs(thirtyDaysAgo.getTime());
  const endDate = dateKeyFromMs(Date.now());

  const recentBlocks = await pgDb.getActivityBlocksForDateRange(userId, startDate, endDate);

  const clientMap = new Map<string, { totalMs: number; apps: Set<string>; lastDate: string }>();

  for (const b of recentBlocks) {
    if (!b.clientName) continue;
    const existing = clientMap.get(b.clientName) ?? {
      totalMs: 0,
      apps: new Set<string>(),
      lastDate: b.date,
    };
    existing.totalMs += b.durationMs;
    if (b.appName) existing.apps.add(b.appName);
    if (b.date > existing.lastDate) existing.lastDate = b.date;
    clientMap.set(b.clientName, existing);
  }

  return [...clientMap.entries()].map(([name, data]) => ({
    name,
    totalMinutes: Math.round(data.totalMs / 60000),
    recentApps: [...data.apps],
    lastSeenDate: data.lastDate,
  }));
}

// ── RLM-Powered Analysis ────────────────────────────────────────────────────

async function runBlockAnalyzerRLM(
  sessionId: string,
  userId: string,
  completionFn: CompletionFn
): Promise<EmittedBlock[]> {
  const session = await pgDb.getMonitoringSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const [classifications, captures, transcripts, story] = await Promise.all([
    pgDb.getClassificationsForSession(sessionId),
    pgDb.getCapturesForSession(sessionId),
    pgDb.getTranscriptionsForSession(sessionId),
    pgDb.getStoryForSession(sessionId),
  ]);

  // Load block.md from disk
  let blockMdContent = "";
  const exportPath = await pgDb.getExportPath(sessionId);
  if (exportPath) {
    try {
      blockMdContent = await fs.readFile(exportPath, "utf-8");
    } catch {
      logger.warn("Could not read block.md at", exportPath);
    }
  }

  const durationMs = (session.endedAt ?? Date.now()) - session.startedAt - session.totalPausedMs;

  const sessionMeta = {
    sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMinutes: Math.round(durationMs / 60000),
    name: session.name,
    sessionGoal: session.sessionGoal,
    captureCount: captures.length,
    classificationCount: classifications.length,
    hasTranscripts: transcripts.length > 0,
    hasStory: !!story,
  };

  const knownClients = await loadKnownClients(userId);
  const knownClientNames = knownClients.map((c) => c.name);

  const env = new BlockAnalyzerEnvironment(
    sessionMeta,
    blockMdContent,
    story?.narrative ?? null,
    classifications,
    captures,
    transcripts,
    knownClients
  );

  const systemPrompt = getBlockAnalyzerSystemPrompt(knownClientNames);
  const userPrompt = getBlockAnalyzerUserPrompt();

  const result = await runRLMLoop<BlockAnalyzerEnvironment, unknown>(
    systemPrompt,
    userPrompt,
    BLOCK_ANALYZER_TOOLS,
    env,
    {
      maxIterations: 15,
      temperature: 0.1,
      maxTokens: 2048,
      doneResultField: "blocks",
      completionFn,
    }
  );

  logger.info(
    `Block Analyzer RLM finished: ${result.iterations} iterations, ${result.toolHistory.length} tool calls, success=${result.success}`
  );

  return env.getEmittedBlocks();
}

// ── Fallback: Pure Math Grouping ────────────────────────────────────────────

function fallbackGroupBlocks(
  classifications: LocalClassification[],
  captures: LocalCapture[],
  _sessionStartedAt: number
): EmittedBlock[] {
  if (classifications.length === 0) return [];

  const tsMap = new Map<number, number>();
  for (const c of captures) tsMap.set(c.sequenceNumber, c.capturedAt);

  const blocks: EmittedBlock[] = [];
  let current: EmittedBlock | null = null;

  for (const cl of classifications) {
    const category = normalizeCategory(cl.activityType);
    const startMs = tsMap.get(cl.startSequence) ?? cl.createdAt;
    const endMs = tsMap.get(cl.endSequence) ?? cl.createdAt;

    if (current && current.category === category) {
      current.endMs = Math.max(current.endMs, endMs);
      current.durationMs = current.endMs - current.startMs;
      if (cl.activityDescription) current.description = cl.activityDescription;
    } else {
      if (current && current.durationMs >= MIN_BLOCK_DURATION_MS) blocks.push(current);
      const appName = dominantApp(captures, cl.startSequence, cl.endSequence);
      current = {
        type: category === "meeting" ? "meeting" : "work",
        name: cl.activityDescription || category,
        startMs,
        endMs: Math.max(endMs, startMs),
        durationMs: Math.max(endMs - startMs, 0),
        description: cl.activityDescription || category,
        apps: appName ? [appName] : [],
        category,
      };
    }
  }
  if (current && current.durationMs >= MIN_BLOCK_DURATION_MS) blocks.push(current);

  return blocks;
}

function normalizeCategory(activityType: string | null): string {
  if (!activityType) return "other";
  const lower = activityType.toLowerCase().trim();
  if (lower.includes("meeting") || lower.includes("call")) return "meeting";
  if (lower.includes("coding") || lower.includes("development") || lower.includes("code"))
    return "development";
  if (
    lower.includes("communication") ||
    lower.includes("messaging") ||
    lower.includes("email") ||
    lower.includes("chat")
  )
    return "communication";
  if (lower.includes("research") || lower.includes("browsing") || lower.includes("reading"))
    return "research";
  if (lower.includes("writing") || lower.includes("document")) return "documentation";
  if (lower.includes("design")) return "design";
  if (lower.includes("review")) return "review";
  if (lower.includes("break") || lower.includes("idle")) return "break";
  return lower || "other";
}

function dominantApp(captures: LocalCapture[], startSeq: number, endSeq: number): string {
  const counts = new Map<string, number>();
  for (const c of captures) {
    if (c.sequenceNumber >= startSeq && c.sequenceNumber <= endSeq && c.appName) {
      counts.set(c.appName, (counts.get(c.appName) ?? 0) + 1);
    }
  }
  let best = "";
  let bestCount = 0;
  for (const [app, count] of counts) {
    if (count > bestCount) {
      best = app;
      bestCount = count;
    }
  }
  return best;
}

// ── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Aggregate a session's activities into structured blocks and update daily summary.
 *
 * @param sessionId - The session to analyze
 * @param completionFn - Optional BYOK LLM completion function. If provided,
 *   runs the full RLM for client/topic attribution. If null, falls back to
 *   pure numeric grouping (no client names, no descriptive block names).
 */
export async function aggregateSession(
  sessionId: string,
  completionFn?: CompletionFn | null
): Promise<void> {
  const t0 = Date.now();

  const session = await pgDb.getMonitoringSession(sessionId);
  if (!session) {
    logger.warn("aggregateSession: session not found", sessionId);
    return;
  }

  const userId = session.userId;
  if (!userId) {
    logger.warn("aggregateSession: no userId on session", sessionId);
    return;
  }

  // Clear previous blocks for idempotent re-runs
  await pgDb.deleteActivityBlocksForSession(sessionId);

  let emittedBlocks: EmittedBlock[];

  if (completionFn) {
    try {
      emittedBlocks = await runBlockAnalyzerRLM(sessionId, userId, completionFn);
    } catch (err) {
      logger.error("Block Analyzer RLM failed, falling back to numeric grouping:", String(err));
      const [classifications, captures] = await Promise.all([
        pgDb.getClassificationsForSession(sessionId),
        pgDb.getCapturesForSession(sessionId),
      ]);
      emittedBlocks = fallbackGroupBlocks(classifications, captures, session.startedAt);
    }
  } else {
    logger.info("No BYOK provider — using fallback numeric grouping");
    const [classifications, captures] = await Promise.all([
      pgDb.getClassificationsForSession(sessionId),
      pgDb.getCapturesForSession(sessionId),
    ]);
    emittedBlocks = fallbackGroupBlocks(classifications, captures, session.startedAt);
  }

  if (emittedBlocks.length === 0) {
    logger.info("aggregateSession: no blocks produced", sessionId);
    return;
  }

  const sessionDate = dateKeyFromMs(session.startedAt);

  for (const block of emittedBlocks) {
    const appName = block.apps.length > 0 ? block.apps[0] : "";
    await pgDb.insertActivityBlock({
      id: randomUUID(),
      sessionId,
      userId,
      date: sessionDate,
      category: block.category,
      appName,
      description: block.description,
      clientName: block.clientName ?? null,
      startMs: block.startMs,
      endMs: block.endMs,
      durationMs: block.durationMs,
      blockType: block.type,
    });
  }

  logger.info(`Wrote ${emittedBlocks.length} activity blocks for session ${sessionId}`);

  await rebuildDailySummary(userId, sessionDate);

  // Push update to all renderer windows so the Me tab refreshes
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("me-activity:updated", { sessionId, date: sessionDate });
    }
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logger.info(`aggregateSession completed in ${elapsed}s`);
}

// ── Daily Summary ───────────────────────────────────────────────────────────

async function rebuildDailySummary(userId: string, date: string): Promise<void> {
  const blocks = await pgDb.getActivityBlocksForDate(userId, date);

  let totalActiveMs = 0;
  const categoryMs: Record<string, number> = {};
  const appMs: Record<string, number> = {};
  const sessionIds = new Set<string>();

  for (const b of blocks) {
    totalActiveMs += b.durationMs;
    categoryMs[b.category] = (categoryMs[b.category] ?? 0) + b.durationMs;
    if (b.appName) {
      appMs[b.appName] = (appMs[b.appName] ?? 0) + b.durationMs;
    }
    sessionIds.add(b.sessionId);
  }

  await pgDb.upsertDailySummary({
    id: `${userId}:${date}`,
    userId,
    date,
    totalActiveMs,
    sessionCount: sessionIds.size,
    categoryBreakdown: JSON.stringify(categoryMs),
    appBreakdown: JSON.stringify(appMs),
  });

  logger.info(
    `Daily summary for ${date}: ${(totalActiveMs / 60000).toFixed(0)}min across ${sessionIds.size} sessions`
  );
}
