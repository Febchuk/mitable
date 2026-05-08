/**
 * Local Inference Service — Deferred Processing
 *
 * During a session, the app is a lightweight screen/audio recorder.
 * Zero GPU usage, zero Ollama calls. Frames are persisted to disk by
 * localFrameStorage; audio is flushed by localAudioService with timestamped
 * transcript segments accumulated via the session timeline ledger.
 *
 * All AI processing happens at session end via processAllAtEnd():
 *
 *   1. Load timeline.json (session clock, frame offsets, transcript segments)
 *   2. Create .md file with header
 *   3. Load Ollama model into VRAM
 *   4. For each batch of 20 frames (loaded lazily from disk):
 *      a. Sensor — 5x 4-frame consecutive vision calls with metadata
 *      b. Match transcript segments by offsetMs overlap
 *      c. Classify — descriptions + matched transcripts
 *      d. Append batch section to .md immediately
 *      e. RLM storyteller iteration
 *   5. Write final summary to .md
 *   6. Unload model from VRAM
 *
 * All outputs stored in local SQLite. Only final summaries leave the device.
 */

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join } from "path";
import { createLogger } from "../../lib/logger";
import { ollamaService } from "./ollamaService";
import { localDb } from "./localDb";
import { localAudioService } from "./localAudioService";
import { whisperCliService } from "./whisperCliService";
import { sessionTimeline, type TranscriptSegment } from "./sessionTimeline";
import { runRLMLoop, type CompletionFn } from "./rlm/local-rlm-engine";
import { StorytellerEnvironment } from "./rlm/storyteller-rlm-environment";
import { STORYTELLER_TOOLS } from "./rlm/storyteller-rlm-tools";
import {
  getStorytellerSystemPrompt,
  getStorytellerUserPrompt,
} from "./rlm/storyteller-rlm-prompts";
import type { IntervalEvidence } from "../activityTracker";

const logger = createLogger("LocalInference");

const BATCH_SIZE = 20;
const SENSOR_GROUP_SIZE_DEFAULT = 4;
const SENSOR_GROUP_SIZE_INTEGRATED = 4;

// ── Types ───────────────────────────────────────────────────────────────────

export interface BufferedFrame {
  frameId: string;
  sessionId: string;
  sequenceNumber: number;
  capturedAt: number;
  offsetMs: number;
  imageBase64: string;
  previousImageBase64: string | null;
  windowId: string;
  appName: string;
  windowTitle: string;
  intervalEvidence?: IntervalEvidence;
  browserContext?: { activeTabUrl: string; activeTabTitle: string; tabCount: number };
}

interface SensorResult {
  description: string;
  frameDescriptions: Array<{
    sequenceNumber: number;
    description: string;
    userAction: string | null;
  }>;
}

// ── Service ─────────────────────────────────────────────────────────────────

class LocalInferenceService {
  private currentSessionId: string | null = null;
  private exportPaths = new Map<string, string>();

  // ── Hybrid inference entry point ────────────────────────────────────────
  /**
   * Analyze a batch of frames using local Ollama vision.
   * Called by hybridInferenceService when hardware is capable.
   */
  async analyzeBatchLocal(
    batch: BufferedFrame[],
    transcriptSegments: string
  ): Promise<BatchAnalysisResult> {
    // Run sensor (vision analysis)
    const sensorResults = await this.runConsecutiveSensor(batch);

    // Run classifier (summarize batch narrative)
    const batchNarrative = await this.classifyBatch(batch, sensorResults, transcriptSegments);

    return {
      frameDescriptions: sensorResults.flatMap((s) => s.frameDescriptions),
      batchNarrative,
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start(sessionId: string): void {
    this.currentSessionId = sessionId;

    whisperCliService
      .initialize()
      .catch((err) => logger.warn("whisper-cli pre-init failed:", String(err)));

    logger.info("Started local inference for session", sessionId);
  }

  stop(): void {
    this.currentSessionId = null;
    logger.info("Stopped local inference");
  }

  clear(): void {
    logger.info("Cleared inference state");
  }

  getExportPath(sessionId: string): string | null {
    return this.exportPaths.get(sessionId) ?? null;
  }

  // ── End-of-session processing ──────────────────────────────────────────

  /**
   * Run the full AI pipeline on all captured data after the session ends.
   * Streams results to the .md file as each batch completes.
   *
   * Steps: timeline → .md header → load model → per-batch (sensor + classify + append .md + RLM) → summary → unload
   */
  async processAllAtEnd(
    sessionId: string,
    sessionDir: string,
    onProgress?: (progress: {
      sessionId: string;
      step: string;
      batchIndex?: number;
      totalBatches?: number;
      percent: number;
      label: string;
    }) => void
  ): Promise<void> {
    const t0 = Date.now();
    logger.info(`processAllAtEnd starting for session ${sessionId}`);

    const emit = (
      step: string,
      percent: number,
      label: string,
      extra?: { batchIndex?: number; totalBatches?: number }
    ) => {
      onProgress?.({ sessionId, step, percent, label, ...extra });
    };

    emit("loading_manifest", 2, "Loading session data...");

    // ── Step 1: Load timeline and frame manifest ───────────────────────
    const timeline = sessionTimeline.load(sessionDir) ?? sessionTimeline.get();
    const { localFrameStorage } = await import("../localFrameStorage");
    const manifest = await localFrameStorage.loadManifest(sessionId);
    if (!manifest || manifest.frames.length === 0) {
      logger.warn("No frames found for session", sessionId);
      return;
    }

    const sessionStartMs = timeline?.sessionStartMs ?? new Date(manifest.startedAt).getTime();
    const allFrameMeta = manifest.frames;
    logger.info(`Found ${allFrameMeta.length} frames on disk`);

    // ── Step 2: Create .md file with clean header ──────────────────────
    const mdPath = await this.initMarkdownFile(sessionId, sessionStartMs, allFrameMeta);
    if (!mdPath) {
      logger.error("Failed to create markdown file — continuing without streaming writes");
    }

    // ── Step 3: Load Ollama model ──────────────────────────────────────
    emit("loading_model", 5, "Loading AI model...");
    logger.info("Loading Ollama model for end-of-session processing...");
    if (!ollamaService.isReady()) {
      const { initialize } = await import("./ollamaLifecycle");
      await initialize();
    }
    emit("loading_model", 10, "AI model ready");

    // Get transcript segments from timeline (accumulated during recording)
    const allTranscripts = localAudioService.getAccumulatedTranscripts();
    const hasStreamedAudio = allTranscripts.length > 0;

    emit("transcribing", 12, "Processing audio transcripts...");

    // Deduplicate: skip transcription if already done in a previous run
    const existingTranscripts = localDb.getTranscriptionsForSession(sessionId);
    if (existingTranscripts.length > 0) {
      logger.info(`Skipping transcription — ${existingTranscripts.length} segments already in DB`);
    } else if (hasStreamedAudio) {
      logger.info(`Using ${allTranscripts.length} streaming transcript segments`);
      for (let i = 0; i < allTranscripts.length; i++) {
        const seg = allTranscripts[i];
        localDb.insertTranscription({
          id: randomUUID(),
          sessionId,
          chunkIndex: i,
          speakerId: seg.source === "user" ? 0 : 1,
          transcript: seg.text,
          startTimeMs: Math.round(seg.startOffsetMs),
          endTimeMs: Math.round(seg.endOffsetMs),
          confidence: 0.9,
          source: seg.source,
        });
      }
    } else {
      logger.info("No streaming transcripts — will transcribe from disk as fallback");
      const audioData = localAudioService.readAllAudio(sessionDir);
      if (audioData.user.durationSec > 0 || audioData.remote.durationSec > 0) {
        await this.transcribeAllAudio(audioData, sessionId);
      }
    }

    emit("transcribing", 18, "Audio processing complete");

    try {
      // ── Step 4: Process frames in batches ────────────────────────────
      const totalBatches = Math.ceil(allFrameMeta.length / BATCH_SIZE);
      let batchIndex = 0;

      // Deduplicate: determine which batches are already fully processed
      const existingCaptures = localDb.getCapturesForSession(sessionId);
      const existingClassifications = localDb.getClassificationsForSession(sessionId);
      const processedSeqNumbers = new Set(existingCaptures.map((c) => c.sequenceNumber));
      const processedBatchIndices = new Set(existingClassifications.map((c) => c.batchIndex));

      if (processedBatchIndices.size > 0) {
        logger.info(
          `Resuming: ${processedBatchIndices.size}/${totalBatches} batches already processed, ` +
            `${processedSeqNumbers.size}/${allFrameMeta.length} frames already captured`
        );
      }

      for (let offset = 0; offset < allFrameMeta.length; offset += BATCH_SIZE) {
        const batchMeta = allFrameMeta.slice(offset, offset + BATCH_SIZE);
        const batchIdx = batchIndex++;

        // Skip batches that are already fully processed
        if (processedBatchIndices.has(batchIdx)) {
          logger.info(`Batch ${batchIdx}: already processed — skipping`);
          continue;
        }

        const batchPercent = 20 + Math.round((batchIdx / totalBatches) * 60);
        emit(
          "processing_batch",
          batchPercent,
          `Analyzing frames (${batchIdx + 1} of ${totalBatches})...`,
          {
            batchIndex: batchIdx,
            totalBatches,
          }
        );

        // Lazy-load only this batch's images from disk
        const batch: BufferedFrame[] = [];
        for (const frameMeta of batchMeta) {
          const imageBase64 = await localFrameStorage.getFrameAsDataUrl(
            sessionId,
            frameMeta.filename
          );
          if (!imageBase64) {
            logger.warn(`Skipping frame ${frameMeta.sequenceNumber} — image not found`);
            continue;
          }
          const capturedAt = new Date(frameMeta.timestamp).getTime();
          batch.push({
            frameId: frameMeta.frameId,
            sessionId,
            sequenceNumber: frameMeta.sequenceNumber,
            capturedAt,
            offsetMs: capturedAt - sessionStartMs,
            imageBase64,
            previousImageBase64: null,
            windowId: frameMeta.windowSourceId,
            appName: frameMeta.appName,
            windowTitle: frameMeta.windowTitle,
          });
        }

        if (batch.length === 0) continue;

        logger.info(
          `Batch ${batchIdx}: ${batch.length} frames ` +
            `(seq ${batch[0].sequenceNumber}-${batch[batch.length - 1].sequenceNumber})`
        );

        // 4a. Sensor — 4-frame consecutive vision calls
        const sensorResults = await this.runConsecutiveSensor(batch);

        // Store captures in SQLite
        for (const frame of batch) {
          const frameDesc = sensorResults
            .flatMap((s) => s.frameDescriptions)
            .find((fd) => fd.sequenceNumber === frame.sequenceNumber);
          localDb.insertCapture({
            id: randomUUID(),
            sessionId: frame.sessionId,
            frameId: frame.frameId,
            sequenceNumber: frame.sequenceNumber,
            capturedAt: frame.capturedAt,
            windowId: frame.windowId,
            appName: frame.appName,
            windowTitle: frame.windowTitle,
            sensorOutput: frameDesc?.description ?? `[${frame.appName}] ${frame.windowTitle}`,
            deltaChanged:
              (frame.intervalEvidence?.keyboardEventCount ?? 0) > 0 ||
              (frame.intervalEvidence?.mouseClickCount ?? 0) > 0,
            changeType:
              (frame.intervalEvidence?.keyboardEventCount ?? 0) > 0 ||
              (frame.intervalEvidence?.mouseClickCount ?? 0) > 0
                ? "user_interaction"
                : "passive_view",
            userAction: frameDesc?.userAction ?? this.inferAction(frame.intervalEvidence),
          });
        }

        // 4b. Match transcript segments by time overlap
        const batchStartOffset = batch[0].offsetMs;
        const batchEndOffset = batch[batch.length - 1].offsetMs;
        const matchedTranscripts = hasStreamedAudio
          ? allTranscripts.filter(
              (seg) => seg.endOffsetMs > batchStartOffset && seg.startOffsetMs < batchEndOffset
            )
          : [];

        const transcriptText = matchedTranscripts
          .map((seg) => {
            const speaker = seg.source === "user" ? "User" : "Remote";
            return `${speaker}: ${seg.text}`;
          })
          .join("\n");

        // 4c. Classify batch with sensor + transcript
        const chunkNarrative = await this.classifyBatch(batch, sensorResults, transcriptText);
        localDb.insertClassification({
          id: randomUUID(),
          sessionId,
          batchIndex: batchIdx,
          startSequence: batch[0].sequenceNumber,
          endSequence: batch[batch.length - 1].sequenceNumber,
          activityDescription: chunkNarrative,
          activityType: null,
          onTask: true,
          taskRelevance: null,
          importanceScore: 0.5,
          rawOutput: "",
        });

        // 4d. Append batch section to .md immediately
        if (mdPath) {
          await this.appendBatchToMarkdown(
            mdPath,
            batchIdx,
            batch,
            sensorResults,
            matchedTranscripts,
            chunkNarrative,
            sessionStartMs
          );
        }

        logger.info(`Batch ${batchIdx} complete: ${chunkNarrative.slice(0, 120)}`);
      }

      // ── Step 5: RLM Storyteller ──────────────────────────────────────
      const existingStory = localDb.getStoryForSession(sessionId);
      if (existingStory) {
        logger.info("Summary already exists — skipping storyteller");
      } else {
        emit("generating_summary", 85, "Writing summary...");
        logger.info("Generating session summary via RLM storyteller...");
        const lastFrameTs = new Date(allFrameMeta[allFrameMeta.length - 1].timestamp).getTime();
        const realDurationMin = Math.max(1, Math.round((lastFrameTs - sessionStartMs) / 60_000));
        await this.generateSummary(sessionId, realDurationMin);
      }

      // ── Step 6: Prepend summary to .md ────────────────────────────────
      emit("exporting", 95, "Finalizing...");
      if (mdPath) {
        await this.prependSummaryToMarkdown(mdPath, sessionId);
      }
    } finally {
      logger.info("Unloading Ollama model from VRAM...");
      await ollamaService.forceUnloadModel();
    }

    emit("complete", 100, "Done");
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    logger.info(`processAllAtEnd completed in ${elapsed}s`);
  }

  // ── Sensor: 4-frame consecutive vision calls ────────────────────────────
  //
  // Process frames in groups of 4 consecutive screenshots. The model receives
  // all 4 images + per-frame metadata (app, title, URL, activity events).
  // No window grouping — chronological order preserved, context switches visible.

  private async runConsecutiveSensor(batch: BufferedFrame[]): Promise<SensorResult[]> {
    const results: SensorResult[] = [];

    const { getTier } = await import("./ollamaLifecycle");
    const groupSize =
      getTier() === "integrated" ? SENSOR_GROUP_SIZE_INTEGRATED : SENSOR_GROUP_SIZE_DEFAULT;

    for (let i = 0; i < batch.length; i += groupSize) {
      const group = batch.slice(i, i + groupSize);
      try {
        const result = await this.analyzeFrameGroup(group);
        results.push(result);
      } catch (err) {
        logger.warn(`Sensor group failed (seq ${group[0].sequenceNumber}):`, String(err));
        results.push({
          description: group.map((f) => `[${f.appName}] ${f.windowTitle}`).join("; "),
          frameDescriptions: group.map((f) => ({
            sequenceNumber: f.sequenceNumber,
            description: `[${f.appName}] ${f.windowTitle}`,
            userAction: this.inferAction(f.intervalEvidence),
          })),
        });
      }
    }

    return results;
  }

  private async analyzeFrameGroup(frames: BufferedFrame[]): Promise<SensorResult> {
    const sessionStartMs = sessionTimeline.getSessionStartMs();

    const frameContexts: string[] = [];
    const imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const offsetSec = ((frame.capturedAt - sessionStartMs) / 1000).toFixed(0);
      const lines: string[] = [];

      lines.push(`Frame ${i + 1} (${offsetSec}s into session):`);
      lines.push(`  App: ${frame.appName} | Title: ${frame.windowTitle}`);
      if (frame.browserContext) {
        lines.push(`  URL: ${frame.browserContext.activeTabUrl}`);
      }

      const ev = frame.intervalEvidence;
      if (ev) {
        const parts: string[] = [];
        if (ev.keyboardEventCount > 0) parts.push(`${ev.keyboardEventCount} keystrokes`);
        if (ev.mouseClickCount > 0) parts.push(`${ev.mouseClickCount} clicks`);
        if (ev.mouseScrollCount > 0) parts.push(`${ev.mouseScrollCount} scrolls`);
        if (ev.copyCount > 0) parts.push(`${ev.copyCount} copies`);
        if (ev.pasteCount > 0) parts.push(`${ev.pasteCount} pastes`);
        if (parts.length > 0) lines.push(`  Activity: ${parts.join(", ")}`);
      }

      frameContexts.push(lines.join("\n"));
      imageContents.push({
        type: "image_url",
        image_url: { url: this.ensureDataUrl(frame.imageBase64) },
      });
    }

    const metadataStr = frameContexts.join("\n\n");
    const promptText = `${frames.length} consecutive screenshots (~10s apart). Describe what's visible on each screen and what the user is doing. Note any app switches.\n\n${metadataStr}`;

    const response = await ollamaService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You describe screen activity across consecutive screenshots in plain sentences. " +
            "Be specific: name files, URLs, video titles, code functions, chat contacts — whatever is visible. " +
            "Note app switches when the metadata changes between frames. " +
            "Write one sentence per frame, prefixed with the frame number. " +
            "Example: 'Frame 1: VS Code editing localInferenceService.ts, function processAllAtEnd visible. " +
            "Frame 2: Same file, scrolled down to the sensor method. " +
            "Frame 3: Switched to Chrome, Stack Overflow page about streaming file writes. " +
            "Frame 4: Same SO page, scrolling through accepted answer.' " +
            "No markdown formatting, no headers, no bullets.",
        },
        {
          role: "user",
          content: [...imageContents, { type: "text", text: promptText }],
        },
      ],
      { temperature: 0.1, max_tokens: 300 }
    );

    let fullDescription = response.trim();

    // Detect hallucination
    const lower = fullDescription.toLowerCase();
    const isHallucination =
      (lower.includes("provide") &&
        (lower.includes("screenshot") || lower.includes("image") || lower.includes("frame"))) ||
      (lower.includes("awaiting") && lower.includes("input")) ||
      lower.includes("no visual content") ||
      lower.includes("no images were provided");

    if (isHallucination) {
      fullDescription = frames
        .map((f, i) => `Frame ${i + 1}: ${f.appName} — ${f.windowTitle}`)
        .join(". ");
    }

    // Parse per-frame descriptions from the response
    const frameDescriptions = frames.map((frame, i) => {
      const framePrefix = `frame ${i + 1}:`;
      const lines = fullDescription.split(/(?=frame \d+:)/i);
      const matchLine = lines.find((l) => l.toLowerCase().startsWith(framePrefix));
      const desc = matchLine
        ? matchLine.replace(/^frame \d+:\s*/i, "").trim()
        : `[${frame.appName}] ${frame.windowTitle}`;

      return {
        sequenceNumber: frame.sequenceNumber,
        description: desc,
        userAction: this.inferAction(frame.intervalEvidence),
      };
    });

    return { description: fullDescription, frameDescriptions };
  }

  private ensureDataUrl(base64: string): string {
    return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  }

  private inferAction(evidence?: IntervalEvidence): string | null {
    if (!evidence) return null;
    if (evidence.keyboardEventCount > 10) return "typing";
    if (evidence.pasteCount > 0) return "pasting";
    if (evidence.copyCount > 0) return "copying";
    if (evidence.mouseScrollCount > 3) return "scrolling/reading";
    if (evidence.mouseClickCount > 0) return "clicking/navigating";
    return "idle/watching";
  }

  // ── Audio transcription ───────────────────────────────────────────────

  private async transcribeAllAudio(
    audio: {
      user: { pcm: Buffer; durationSec: number };
      remote: { pcm: Buffer; durationSec: number };
    },
    sessionId: string
  ): Promise<string> {
    const useCli = whisperCliService.isReady() || (await whisperCliService.initialize());

    if (!useCli) {
      logger.warn("whisper-cli not available — skipping transcription");
      return "";
    }

    logger.info("Transcribing with whisper-cli");

    const parts: string[] = [];

    for (const source of ["user", "remote"] as const) {
      const { pcm, durationSec } = audio[source];
      if (pcm.length === 0 || durationSec < 1) continue;

      const t0 = Date.now();
      try {
        const transcript = await whisperCliService.transcribeChunked(pcm, 25);

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        if (transcript.length > 0) {
          const speaker = source === "user" ? "User" : "Remote participant";
          parts.push(`${speaker}: ${transcript}`);

          localDb.insertTranscription({
            id: randomUUID(),
            sessionId,
            chunkIndex: 0,
            speakerId: 0,
            transcript,
            startTimeMs: 0,
            endTimeMs: durationSec * 1000,
            confidence: 0.9,
            source,
          });

          logger.info(
            `[${source}] ${engine} transcribed ${durationSec}s in ${elapsed}s: "${transcript.slice(0, 120)}..."`
          );
        } else {
          logger.info(`[${source}] ${durationSec}s audio — ${engine} returned empty (${elapsed}s)`);
        }
      } catch (err) {
        logger.warn(`[${source}] ${engine} transcription failed:`, String(err));
      }
    }

    return parts.join("\n");
  }

  // ── Text-only classifier ──────────────────────────────────────────────

  private async classifyBatch(
    batch: BufferedFrame[],
    sensorResults: SensorResult[],
    transcript: string
  ): Promise<string> {
    const descriptionLines = sensorResults.map((s) => s.description);

    let prompt = `Screen observations from ${batch.length} frames:\n`;
    prompt += descriptionLines.join("\n");

    if (transcript) {
      prompt += `\n\nAudio during this period:\n${transcript}`;
    }

    const response = await ollamaService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You write concise work session summaries focused on CONTENT, not patterns. Given screen observations and optional audio, write 2-4 sentences about WHAT the user was working on — specific topics, files, videos, conversations, code changes, documents. Do NOT describe meta-patterns like 'the user switched between apps repeatedly'. Instead: what was the video about? What code was being edited? What was being discussed? Third person past tense.",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.2, max_tokens: 300 }
    );

    return response.trim() || "Activity recorded.";
  }

  // ── Session-end summary (RLM storyteller) ───────────────────────────────

  async generateSummary(sessionId: string, totalMinutes?: number): Promise<string> {
    const classifications = localDb.getClassificationsForSession(sessionId);
    const transcriptions = localDb.getTranscriptionsForSession(sessionId);

    if (classifications.length === 0 && transcriptions.length === 0) {
      const narrative = "No activity was recorded during this session.";
      localDb.insertStory({
        id: randomUUID(),
        sessionId,
        narrative,
        tasks: "[]",
        timeBreakdown: null,
        modelUsed: ollamaService.getLoadedModel() ?? "gemma4",
      });
      return narrative;
    }

    const completionFn: CompletionFn = (msgs, opts) =>
      ollamaService.chatCompletion(msgs, {
        temperature: opts?.temperature,
        max_tokens: opts?.max_tokens,
        format: "json",
      });

    const env = new StorytellerEnvironment({
      sessionId,
      classifications,
      transcriptions,
      completionFn,
      totalMinutes,
    });

    const result = await runRLMLoop<StorytellerEnvironment, { narrative: string }>(
      getStorytellerSystemPrompt(),
      getStorytellerUserPrompt(classifications.length),
      STORYTELLER_TOOLS,
      env,
      {
        maxIterations: 15,
        doneResultField: "summary",
        temperature: 0.3,
        maxTokens: 32768,
        completionFn,
      }
    );

    const story = env.getFinalStory() ?? result.result;
    let narrative = story?.narrative || "";

    narrative = narrative
      .replace(/[",}\s]*<\/?tool_call\|?>.*$/s, "")
      .replace(/[",}\s]*\}\s*\}\s*$/, "")
      .replace(/\\n/g, "\n")
      .trim();

    if (narrative.length < 30) {
      const chunks = classifications.map((c) => c.activityDescription).filter(Boolean);
      if (chunks.length > 0) {
        narrative = chunks.join(" ").slice(0, 2000);
        logger.warn("RLM narrative too short, using stitched classifications as fallback");
      } else {
        narrative = "Session completed.";
      }
    }

    localDb.insertStory({
      id: randomUUID(),
      sessionId,
      narrative,
      tasks: "[]",
      timeBreakdown: null,
      modelUsed: ollamaService.getLoadedModel() ?? "gemma4",
    });

    localDb.checkpoint();

    logger.info(
      `Summary generated for session ${sessionId}: ${narrative.length} chars, ${result.iterations} iterations`
    );
    return narrative;
  }

  // ── Export for backend ──────────────────────────────────────────────────

  exportResultsForBackend(sessionId: string, _activeDurationMs: number): OnDeviceSummary | null {
    const story = localDb.getStoryForSession(sessionId);
    if (!story) return null;

    return {
      narrative: story.narrative,
      taskBreakdown: [],
      timeBreakdown: null,
      modelUsed: story.modelUsed,
    };
  }

  // ── Streaming Markdown — file grows as batches complete ──────────────────

  private currentMdPath: string | null = null;
  private currentBlockNum = 0;

  private async initMarkdownFile(
    sessionId: string,
    sessionStartMs: number,
    frameMeta: Array<{ timestamp: string; appName: string }>
  ): Promise<string | null> {
    try {
      const { app: electronApp } = await import("electron");
      const sessionDate = new Date(sessionStartMs);
      const monthName = sessionDate.toLocaleString("en-US", { month: "long" }).toLowerCase();
      const dayFolder = `${monthName}_${sessionDate.getDate()}_${sessionDate.getFullYear()}`;

      const docsDir = electronApp.getPath("documents");

      let userFolder = "";
      try {
        const activeId = localDb.getUserPreference("system", "activeLocalUserId");
        logger.info(`[BlockPath] activeLocalUserId = ${activeId || "(empty)"}`);
        if (activeId) {
          const account = localDb.getLocalAccountById(activeId);
          logger.info(`[BlockPath] account email = ${account?.email || "(not found)"}`);
          if (account?.email) {
            userFolder = account.email.replace(/[<>:"/\\|?*]/g, "_");
          }
        }
      } catch (err) {
        logger.warn("[BlockPath] Failed to resolve user folder:", String(err));
      }

      const baseParts = ["Mitable"];
      if (userFolder) baseParts.push(userFolder);
      baseParts.push("blockdata", dayFolder);
      const dayDir = join(docsDir, ...baseParts);
      await fs.mkdir(dayDir, { recursive: true });

      let blockNum = 1;
      try {
        const existing = await fs.readdir(dayDir);
        const blockNums = existing
          .filter((f) => f.startsWith("block_") && f.endsWith(".md"))
          .map((f) => {
            const match = f.match(/^block_(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          });
        if (blockNums.length > 0) blockNum = Math.max(...blockNums) + 1;
      } catch {
        /* fresh directory */
      }

      this.currentBlockNum = blockNum;
      const apps = [...new Set(frameMeta.map((f) => f.appName).filter(Boolean))];
      const startTime = sessionDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      const header = [
        `# Mitable Block ${blockNum}`,
        ``,
        `- **Date:** ${sessionDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
        `- **Started:** ${startTime}`,
        `- **Frames captured:** ${frameMeta.length}`,
        `- **Applications used:** ${apps.join(", ") || "Unknown"}`,
        `- **Session:** ${sessionId}`,
        ``,
        `---`,
        ``,
        `## Detailed Activity Log`,
        ``,
      ].join("\n");

      const mdFilePath = join(dayDir, `block_${blockNum}.md`);
      await fs.writeFile(mdFilePath, header, "utf-8");

      this.currentMdPath = mdFilePath;
      this.exportPaths.set(sessionId, mdFilePath);
      localDb.updateMonitoringSessionExportPath(sessionId, mdFilePath);

      logger.info(`Streaming .md created: ${mdFilePath}`);
      return mdFilePath;
    } catch (err) {
      logger.error("Failed to init markdown file:", String(err));
      return null;
    }
  }

  private async appendBatchToMarkdown(
    mdPath: string,
    batchIdx: number,
    batch: BufferedFrame[],
    sensorResults: SensorResult[],
    transcripts: TranscriptSegment[],
    classifierSummary: string,
    sessionStartMs: number
  ): Promise<void> {
    try {
      const batchStart = new Date(batch[0].capturedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      const batchEnd = new Date(batch[batch.length - 1].capturedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });

      const lines: string[] = [];
      lines.push(`### ${batchStart} – ${batchEnd} (${batch.length} frames)\n`);

      if (classifierSummary) {
        lines.push(`**Summary:** ${classifierSummary}\n`);
      }

      // Build chronological events: frame descriptions + transcript segments
      interface TimeEvent {
        offsetMs: number;
        wallClock: string;
        type: "frame" | "transcript";
        content: string;
      }

      const events: TimeEvent[] = [];

      // Add frame descriptions
      const allFrameDescs = sensorResults.flatMap((s) => s.frameDescriptions);
      for (const frame of batch) {
        const fd = allFrameDescs.find((d) => d.sequenceNumber === frame.sequenceNumber);
        const desc = fd?.description ?? `[${frame.appName}] ${frame.windowTitle}`;
        const action = fd?.userAction ? ` [${fd.userAction}]` : "";
        const wallClock = new Date(frame.capturedAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        });

        events.push({
          offsetMs: frame.offsetMs,
          wallClock,
          type: "frame",
          content: `- **${wallClock}** | ${frame.appName}${action}: ${desc.length > 250 ? desc.slice(0, 250) + "…" : desc}`,
        });
      }

      // Add transcript segments
      for (const seg of transcripts) {
        const wallStart = new Date(sessionStartMs + seg.startOffsetMs).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        });
        const wallEnd = new Date(sessionStartMs + seg.endOffsetMs).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        });
        const speaker = seg.source === "user" ? "User" : "Remote";
        events.push({
          offsetMs: seg.startOffsetMs,
          wallClock: wallStart,
          type: "transcript",
          content: `> **Audio (${wallStart} – ${wallEnd}):** ${speaker}: ${seg.text}`,
        });
      }

      // Sort by offsetMs for chronological order
      events.sort((a, b) => a.offsetMs - b.offsetMs);

      for (const ev of events) {
        lines.push(ev.content);
      }

      lines.push(`\n`);

      await fs.appendFile(mdPath, lines.join("\n"), "utf-8");
    } catch (err) {
      logger.error("Failed to append batch to .md:", String(err));
    }
  }

  private async prependSummaryToMarkdown(mdPath: string, sessionId: string): Promise<void> {
    try {
      const story = localDb.getStoryForSession(sessionId);
      if (!story || story.narrative.length <= 30) return;

      const existing = await fs.readFile(mdPath, "utf-8");

      // Insert summary after the header, before "## Detailed Activity Log"
      const insertPoint = existing.indexOf("## Detailed Activity Log");
      if (insertPoint === -1) {
        await fs.appendFile(mdPath, `\n## Summary\n\n${story.narrative}\n`, "utf-8");
        return;
      }

      const before = existing.slice(0, insertPoint);
      const after = existing.slice(insertPoint);
      const withSummary = `${before}## Summary\n\n${story.narrative}\n\n${after}`;

      // Also update the header with final time range
      const captures = localDb.getCapturesForSession(sessionId);
      if (captures.length > 0) {
        const endTime = new Date(captures[captures.length - 1].capturedAt).toLocaleTimeString(
          "en-US",
          {
            hour: "numeric",
            minute: "2-digit",
          }
        );
        const startTime = new Date(captures[0].capturedAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        const durationMin = Math.round(
          (captures[captures.length - 1].capturedAt - captures[0].capturedAt) / 60_000
        );
        const updatedContent = withSummary.replace(
          /- \*\*Started:\*\* .+/,
          `- **Time:** ${startTime} – ${endTime} (${durationMin} min)`
        );

        await fs.writeFile(mdPath, updatedContent, "utf-8");
      } else {
        await fs.writeFile(mdPath, withSummary, "utf-8");
      }

      // Append footer
      await fs.appendFile(
        mdPath,
        `---\n\n*Exported by Mitable. Paste this file into any AI assistant to generate reports, summaries, or analysis from your work session.*\n`,
        "utf-8"
      );

      logger.info("Summary prepended to .md");
    } catch (err) {
      logger.error("Failed to prepend summary to .md:", String(err));
    }
  }

  // Legacy export method kept for backward compatibility
  async exportSessionMarkdown(sessionId: string): Promise<string | null> {
    return this.exportPaths.get(sessionId) ?? null;
  }
}

export interface OnDeviceSummary {
  narrative: string;
  taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }>;
  timeBreakdown: Record<string, number> | null;
  modelUsed: string;
}

export interface BatchAnalysisResult {
  frameDescriptions: Array<{
    sequenceNumber: number;
    description: string;
    userAction: string | null;
  }>;
  batchNarrative: string;
}

export const localInferenceService = new LocalInferenceService();
