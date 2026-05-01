/**
 * Local Inference Service — Deferred Processing
 *
 * During a session, the app is a lightweight screen/audio recorder.
 * Zero GPU usage, zero Ollama calls. Frames are already persisted to
 * disk by localFrameStorage; audio is flushed to disk by localAudioService.
 *
 * All AI processing happens at session end via processAllAtEnd():
 *
 *   1. Load Ollama model into VRAM
 *   2. Sensor  — paired-frame vision (N, N+1) with activity delta
 *   3. Transcribe — all accumulated audio via Whisper CLI / sherpa-onnx
 *   4. Classify — text-only batches combining sensor + transcript
 *   5. RLM Storyteller — generate final markdown summary
 *   6. Export markdown for AI assistants
 *   7. Unload model from VRAM immediately
 *
 * All outputs stored in local SQLite. Only final summaries leave the device.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../../lib/logger";
import { ollamaService } from "./ollamaService";
import { localDb } from "./localDb";
import { localAudioService } from "./localAudioService";
import { whisperCliService } from "./whisperCliService";
import { sherpaWhisperService } from "./sherpaWhisperService";
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

// ── Types ───────────────────────────────────────────────────────────────────

export interface BufferedFrame {
  frameId: string;
  sessionId: string;
  sequenceNumber: number;
  capturedAt: number;
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
  userAction: string | null;
}

// ── Service ─────────────────────────────────────────────────────────────────

class LocalInferenceService {
  private currentSessionId: string | null = null;
  private exportPaths = new Map<string, string>();

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start(sessionId: string): void {
    this.currentSessionId = sessionId;

    whisperCliService
      .initialize()
      .catch((err) => logger.warn("whisper-cli pre-init failed:", String(err)));
    sherpaWhisperService
      .initialize()
      .catch((err) => logger.warn("sherpa-whisper fallback pre-init failed:", String(err)));

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
   * This is the only time Ollama/GPU is used.
   *
   * Steps: load model → sensor → transcribe → classify → RLM → export → unload
   */
  async processAllAtEnd(sessionId: string, sessionDir: string): Promise<void> {
    const t0 = Date.now();
    logger.info(`processAllAtEnd starting for session ${sessionId}`);

    // Load all frames from disk via localFrameStorage
    const { localFrameStorage } = await import("../localFrameStorage");
    const manifest = await localFrameStorage.loadManifest(sessionId);
    if (!manifest || manifest.frames.length === 0) {
      logger.warn("No frames found for session", sessionId);
      return;
    }

    logger.info(`Found ${manifest.frames.length} frames on disk`);

    // Build BufferedFrame objects from manifest + disk images
    const allFrames: BufferedFrame[] = [];
    for (const frameMeta of manifest.frames) {
      const imageBase64 = await localFrameStorage.getFrameAsDataUrl(sessionId, frameMeta.filename);
      if (!imageBase64) {
        logger.warn(`Skipping frame ${frameMeta.sequenceNumber} — image not found on disk`);
        continue;
      }

      allFrames.push({
        frameId: frameMeta.frameId,
        sessionId,
        sequenceNumber: frameMeta.sequenceNumber,
        capturedAt: new Date(frameMeta.timestamp).getTime(),
        imageBase64,
        previousImageBase64: null,
        windowId: frameMeta.windowSourceId,
        appName: frameMeta.appName,
        windowTitle: frameMeta.windowTitle,
      });
    }

    logger.info(`Loaded ${allFrames.length} frames into memory for processing`);

    if (allFrames.length === 0) return;

    // ── Step 1: Load Ollama model ──────────────────────────────────────
    logger.info("Loading Ollama model for end-of-session processing...");
    if (!ollamaService.isReady()) {
      const { initialize } = await import("./ollamaLifecycle");
      await initialize();
    }

    try {
      // ── Step 2: Sensor — process all frames in batches ─────────────
      logger.info("Running paired sensor on all frames...");
      let batchIndex = 0;

      for (let offset = 0; offset < allFrames.length; offset += BATCH_SIZE) {
        const batch = allFrames.slice(offset, offset + BATCH_SIZE);
        const batchIdx = batchIndex++;

        logger.info(
          `Sensor batch ${batchIdx}: ${batch.length} frames ` +
            `(seq ${batch[0].sequenceNumber}-${batch[batch.length - 1].sequenceNumber})`
        );

        const sensorResults = await this.runPairedSensor(batch);
        const sensorByFrame = this.buildSensorLookup(batch, sensorResults);

        for (const frame of batch) {
          const action = this.inferAction(frame.intervalEvidence);
          localDb.insertCapture({
            id: randomUUID(),
            sessionId: frame.sessionId,
            frameId: frame.frameId,
            sequenceNumber: frame.sequenceNumber,
            capturedAt: frame.capturedAt,
            windowId: frame.windowId,
            appName: frame.appName,
            windowTitle: frame.windowTitle,
            sensorOutput:
              sensorByFrame.get(frame.sequenceNumber) ?? `[${frame.appName}] ${frame.windowTitle}`,
            deltaChanged:
              (frame.intervalEvidence?.keyboardEventCount ?? 0) > 0 ||
              (frame.intervalEvidence?.mouseClickCount ?? 0) > 0,
            changeType:
              (frame.intervalEvidence?.keyboardEventCount ?? 0) > 0 ||
              (frame.intervalEvidence?.mouseClickCount ?? 0) > 0
                ? "user_interaction"
                : "passive_view",
            userAction: action,
          });
        }

        // ── Step 3: Classify batch ───────────────────────────────────
        const chunkNarrative = await this.classifyBatch(batch, sensorResults, "");
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

        logger.info(`Batch ${batchIdx} complete: ${chunkNarrative.slice(0, 120)}`);
      }

      // ── Step 4: Use streaming transcripts (built during recording) ───
      const streamedTranscripts = localAudioService.getAccumulatedTranscripts();
      const hasStreamedAudio =
        streamedTranscripts.user.length > 0 || streamedTranscripts.remote.length > 0;

      if (hasStreamedAudio) {
        logger.info(
          `Using streaming transcripts: user=${streamedTranscripts.user.length} chars, ` +
            `remote=${streamedTranscripts.remote.length} chars`
        );
        for (const source of ["user", "remote"] as const) {
          const text = streamedTranscripts[source];
          if (text.length === 0) continue;
          localDb.insertTranscription({
            id: randomUUID(),
            sessionId,
            source,
            text,
            durationSec: 0,
            engine: "whisper-cli-streaming",
          });
          logger.info(`[${source}] streaming transcript: ${text.slice(0, 100)}...`);
        }
      } else {
        // Fallback: transcribe all audio from disk (if streaming didn't run)
        logger.info("No streaming transcripts — transcribing from disk...");
        const audioData = localAudioService.readAllAudio(sessionDir);
        const hasAudio = audioData.user.durationSec > 0 || audioData.remote.durationSec > 0;
        if (hasAudio) {
          await this.transcribeAllAudio(audioData, sessionId);
        } else {
          logger.info("No audio data found for this session");
        }
      }

      // ── Step 5: Inject transcripts into classifications ──────────────
      // Re-read classifications to update the last batch with the full transcript
      const transcriptions = localDb.getTranscriptionsForSession(sessionId);
      if (transcriptions.length > 0) {
        const transcriptText = transcriptions
          .map((t) => {
            const speaker = t.source === "user" ? "User" : "Remote";
            return `${speaker}: ${t.transcript}`;
          })
          .join("\n");

        // Re-classify the last batch with the transcript context
        const lastBatchFrames = allFrames.slice(Math.max(0, allFrames.length - BATCH_SIZE));
        if (lastBatchFrames.length > 0) {
          const lastSensor = await this.runPairedSensor(lastBatchFrames);
          const enrichedNarrative = await this.classifyBatch(
            lastBatchFrames,
            lastSensor,
            transcriptText
          );

          const classifications = localDb.getClassificationsForSession(sessionId);
          if (classifications.length > 0) {
            const lastClass = classifications[classifications.length - 1];
            localDb.updateClassificationDescription(lastClass.id, enrichedNarrative);
            logger.info("Enriched last classification with audio transcript");
          }
        }
      }

      // ── Step 6: RLM Storyteller ──────────────────────────────────────
      logger.info("Generating session summary via RLM storyteller...");
      await this.generateSummary(sessionId);

      // ── Step 7: Export markdown ────────────────────────────────────────
      const mdPath = await this.exportSessionMarkdown(sessionId);
      if (mdPath) {
        logger.info("Session markdown exported:", mdPath);
      }
    } finally {
      // ── Step 8: Unload model immediately ─────────────────────────────
      logger.info("Unloading Ollama model from VRAM...");
      await ollamaService.forceUnloadModel();
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    logger.info(`processAllAtEnd completed in ${elapsed}s`);
  }

  // ── Step 1: Paired-frame sensor ─────────────────────────────────────────
  //
  // Group by windowId, then pair consecutive frames from the SAME window
  // so the sensor sees temporal deltas (same app, 10s apart) not cross-window.

  private async runPairedSensor(batch: BufferedFrame[]): Promise<SensorResult[]> {
    const byWindow = new Map<string, BufferedFrame[]>();
    for (const frame of batch) {
      const key = frame.windowId || frame.appName;
      if (!byWindow.has(key)) byWindow.set(key, []);
      byWindow.get(key)!.push(frame);
    }

    const pairs: Array<{ frameA: BufferedFrame; frameB: BufferedFrame | null }> = [];
    for (const [, frames] of byWindow) {
      frames.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      for (let i = 0; i < frames.length; i += 2) {
        pairs.push({
          frameA: frames[i],
          frameB: i + 1 < frames.length ? frames[i + 1] : null,
        });
      }
    }

    pairs.sort((a, b) => a.frameA.capturedAt - b.frameA.capturedAt);

    const results: SensorResult[] = [];
    for (const { frameA, frameB } of pairs) {
      try {
        const result = await this.analyzeFramePair(frameA, frameB);
        results.push(result);
      } catch (err) {
        logger.warn(`Sensor pair failed (seq ${frameA.sequenceNumber}):`, String(err));
        results.push({
          description: `[${frameA.appName}] ${frameA.windowTitle}`,
          userAction: this.inferAction(frameA.intervalEvidence),
        });
      }
    }

    return results;
  }

  private buildSensorLookup(
    batch: BufferedFrame[],
    sensorResults: SensorResult[]
  ): Map<number, string> {
    const lookup = new Map<number, string>();

    const byWindow = new Map<string, BufferedFrame[]>();
    for (const frame of batch) {
      const key = frame.windowId || frame.appName;
      if (!byWindow.has(key)) byWindow.set(key, []);
      byWindow.get(key)!.push(frame);
    }

    const pairs: { frameA: BufferedFrame; frameB: BufferedFrame | null }[] = [];
    for (const [, frames] of byWindow) {
      frames.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      for (let i = 0; i < frames.length; i += 2) {
        pairs.push({
          frameA: frames[i],
          frameB: i + 1 < frames.length ? frames[i + 1] : null,
        });
      }
    }
    pairs.sort((a, b) => a.frameA.capturedAt - b.frameA.capturedAt);

    for (let i = 0; i < pairs.length && i < sensorResults.length; i++) {
      const desc = sensorResults[i].description;
      lookup.set(pairs[i].frameA.sequenceNumber, desc);
      if (pairs[i].frameB) {
        lookup.set(pairs[i].frameB!.sequenceNumber, desc);
      }
    }

    return lookup;
  }

  private async analyzeFramePair(
    frameA: BufferedFrame,
    frameB: BufferedFrame | null
  ): Promise<SensorResult> {
    const activityParts: string[] = [];
    for (const frame of [frameA, frameB].filter(Boolean) as BufferedFrame[]) {
      const ev = frame.intervalEvidence;
      if (!ev) continue;
      const parts: string[] = [];
      if (ev.keyboardEventCount > 0) parts.push(`${ev.keyboardEventCount} keystrokes`);
      if (ev.mouseClickCount > 0) parts.push(`${ev.mouseClickCount} clicks`);
      if (ev.mouseScrollCount > 0) parts.push(`${ev.mouseScrollCount} scrolls`);
      if (ev.copyCount > 0) parts.push(`${ev.copyCount} copies`);
      if (ev.pasteCount > 0) parts.push(`${ev.pasteCount} pastes`);
      if (parts.length > 0) activityParts.push(parts.join(", "));
    }

    const contextLines: string[] = [];
    contextLines.push(`App: ${frameA.appName}`);
    if (frameA.windowTitle) contextLines.push(`Window: ${frameA.windowTitle}`);
    if (frameB && frameB.appName !== frameA.appName) {
      contextLines.push(`Then switched to: ${frameB.appName} — ${frameB.windowTitle}`);
    }
    if (frameA.browserContext) {
      contextLines.push(`URL: ${frameA.browserContext.activeTabUrl}`);
    }
    if (activityParts.length > 0) {
      contextLines.push(`Activity between frames: ${activityParts.join("; ")}`);
    }

    const contextStr = contextLines.join("\n");

    const imageContents: Array<{ type: "image_url"; image_url: { url: string } }> = [];

    imageContents.push({
      type: "image_url",
      image_url: { url: this.ensureDataUrl(frameA.imageBase64) },
    });

    if (frameB) {
      imageContents.push({
        type: "image_url",
        image_url: { url: this.ensureDataUrl(frameB.imageBase64) },
      });
    }

    const imageCount = imageContents.length;
    const promptText =
      imageCount === 1
        ? `What content is on screen? 1-2 sentences max.\n${contextStr}`
        : `Same app, ~10s apart. What content is visible and what changed? 1-2 sentences max.\n${contextStr}`;

    const response = await ollamaService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You read screen content in 1-2 plain sentences. No markdown, no headers, no bullet points. Be specific: name the video title, file name, URL, function, chat contact, email subject — whatever is visible. Example good output: 'YouTube video \"How GPS Works\" at 4:32, showing satellite orbit diagram.' Example bad output: '### Screenshot Analysis\\nThe user is viewing...' — NEVER do this. Just plain sentences describing what you see.",
        },
        {
          role: "user",
          content: [...imageContents, { type: "text", text: promptText }],
        },
      ],
      { temperature: 0.1, max_tokens: 100 }
    );

    let description = response.trim();

    const lower = description.toLowerCase();
    const isHallucination =
      (lower.includes("provide") &&
        (lower.includes("screenshot") || lower.includes("image") || lower.includes("frame"))) ||
      (lower.includes("awaiting") && lower.includes("input")) ||
      (lower.includes("need") && lower.includes("screenshot")) ||
      lower.includes("no visual content") ||
      lower.includes("no content visible") ||
      lower.includes("no images were provided") ||
      (lower.startsWith("(") && lower.includes("waiting"));

    if (isHallucination) {
      description = `${frameA.appName}: ${frameA.windowTitle}`;
    }

    return {
      description,
      userAction: this.inferAction(frameA.intervalEvidence),
    };
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
    const useSherpa =
      !useCli && (sherpaWhisperService.isReady() || (await sherpaWhisperService.initialize()));

    if (!useCli && !useSherpa) {
      logger.warn("No Whisper engine available — skipping transcription");
      return "";
    }

    const engine = useCli ? "whisper-cli" : "sherpa";
    logger.info(`Transcribing with ${engine}`);

    const parts: string[] = [];

    for (const source of ["user", "remote"] as const) {
      const { pcm, durationSec } = audio[source];
      if (pcm.length === 0 || durationSec < 1) continue;

      const t0 = Date.now();
      try {
        const transcript = useCli
          ? await whisperCliService.transcribeChunked(pcm, 25)
          : sherpaWhisperService.transcribeChunked(pcm, 15);

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
    const descriptionLines = sensorResults.map((s) => {
      const action = s.userAction ? ` [${s.userAction}]` : "";
      return `${action} ${s.description}`.trim();
    });

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

  async generateSummary(sessionId: string): Promise<string> {
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

  // ── Markdown export for AI assistants ──────────────────────────────────

  async exportSessionMarkdown(sessionId: string): Promise<string | null> {
    const captures = localDb.getCapturesForSession(sessionId);
    const classifications = localDb.getClassificationsForSession(sessionId);
    const transcriptions = localDb.getTranscriptionsForSession(sessionId);
    const story = localDb.getStoryForSession(sessionId);

    if (captures.length === 0 && classifications.length === 0) {
      logger.warn("No data to export for session", sessionId);
      return null;
    }

    const firstCapture = captures[0];
    const lastCapture = captures[captures.length - 1];
    const sessionDate = firstCapture ? new Date(firstCapture.capturedAt) : new Date();
    const endDate = lastCapture ? new Date(lastCapture.capturedAt) : sessionDate;

    const startTime = sessionDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const endTime = endDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const durationMin = Math.round((endDate.getTime() - sessionDate.getTime()) / 60_000);
    const apps = [...new Set(captures.map((c) => c.appName).filter(Boolean))];

    const monthName = sessionDate.toLocaleString("en-US", { month: "long" }).toLowerCase();
    const dayFolder = `${monthName}_${sessionDate.getDate()}_${sessionDate.getFullYear()}`;

    try {
      const { app: electronApp } = await import("electron");
      const { promises: fs } = await import("fs");
      const { join } = await import("path");

      const docsDir = electronApp.getPath("documents");
      const dayDir = join(docsDir, "Mitable", "blockdata", dayFolder);
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
        if (blockNums.length > 0) {
          blockNum = Math.max(...blockNums) + 1;
        }
      } catch {
        /* fresh directory */
      }

      const sections: string[] = [];

      const header = [
        `# Mitable Block ${blockNum}`,
        ``,
        `- **Date:** ${sessionDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
        `- **Time:** ${startTime} – ${endTime} (${durationMin} min)`,
        `- **Frames captured:** ${captures.length}`,
        `- **Applications used:** ${apps.join(", ") || "Unknown"}`,
        `- **Session:** ${sessionId}`,
        ``,
      ].join("\n");
      sections.push(header);

      if (story && story.narrative.length > 30) {
        sections.push(`## Summary\n\n${story.narrative}\n`);
      }

      sections.push(`---\n\n## Detailed Activity Log\n`);

      for (const batch of classifications) {
        const batchCaptures = captures.filter(
          (c) => c.sequenceNumber >= batch.startSequence && c.sequenceNumber <= batch.endSequence
        );
        const batchStart = batchCaptures[0]
          ? new Date(batchCaptures[0].capturedAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })
          : "?";
        const batchEnd =
          batchCaptures.length > 0
            ? new Date(batchCaptures[batchCaptures.length - 1].capturedAt).toLocaleTimeString(
                "en-US",
                { hour: "numeric", minute: "2-digit", second: "2-digit" }
              )
            : "?";

        const batchLines: string[] = [];
        batchLines.push(
          `### Batch ${batch.batchIndex + 1} (${batchStart} – ${batchEnd}, ${batchCaptures.length} frames)\n`
        );

        if (batch.activityDescription) {
          batchLines.push(`**Summary:** ${batch.activityDescription}\n`);
        }

        batchLines.push(`**Screen observations:**\n`);
        let lastDescription = "";
        for (const cap of batchCaptures) {
          const description = cap.sensorOutput || cap.windowTitle;
          const time = new Date(cap.capturedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          });
          const action = cap.userAction ? ` [${cap.userAction}]` : "";

          if (description === lastDescription) {
            batchLines.push(`- **${time}** | ${cap.appName}${action}: *(continued)*`);
          } else {
            const text =
              description.length > 250 ? description.slice(0, 250).trimEnd() + "…" : description;
            batchLines.push(`- **${time}** | ${cap.appName}${action}: ${text}`);
          }
          lastDescription = description;
        }
        batchLines.push(``);

        const batchTranscripts = transcriptions.filter((t) => t.chunkIndex === batch.batchIndex);
        if (batchTranscripts.length > 0) {
          batchLines.push(`**Audio transcript:**\n`);
          for (const t of batchTranscripts) {
            const speaker = t.source === "user" ? "User" : "Remote";
            batchLines.push(`> ${speaker}: ${t.transcript}`);
          }
          batchLines.push(``);
        }

        sections.push(batchLines.join("\n"));
      }

      const classifiedMax =
        classifications.length > 0 ? Math.max(...classifications.map((c) => c.endSequence)) : -1;
      const uncovered = captures.filter((c) => c.sequenceNumber > classifiedMax);
      if (uncovered.length > 0) {
        const tailLines: string[] = [];
        tailLines.push(`### Remaining observations (${uncovered.length} frames)\n`);
        let lastDesc = "";
        for (const cap of uncovered) {
          const time = new Date(cap.capturedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          });
          const description = cap.sensorOutput || cap.windowTitle;
          if (description === lastDesc) {
            tailLines.push(`- **${time}** | ${cap.appName}: *(continued)*`);
          } else {
            const text =
              description.length > 250 ? description.slice(0, 250).trimEnd() + "…" : description;
            tailLines.push(`- **${time}** | ${cap.appName}: ${text}`);
          }
          lastDesc = description;
        }
        tailLines.push(``);
        sections.push(tailLines.join("\n"));
      }

      sections.push(
        `---\n\n*Exported by Mitable. Paste this file into any AI assistant to generate reports, summaries, or analysis from your work session.*\n`
      );

      const MAX_BYTES = 8 * 1024 * 1024;
      const files: Array<{ name: string; content: string }> = [];
      let currentContent = "";
      let partNum = 1;

      for (const section of sections) {
        const wouldBe = Buffer.byteLength(currentContent + section, "utf-8");
        if (wouldBe > MAX_BYTES && currentContent.length > 0) {
          const name =
            partNum === 1 ? `block_${blockNum}.md` : `block_${blockNum}_part_${partNum}.md`;
          files.push({ name, content: currentContent });
          partNum++;
          currentContent = section;
        } else {
          currentContent += section;
        }
      }
      if (currentContent.length > 0) {
        const name =
          partNum === 1 ? `block_${blockNum}.md` : `block_${blockNum}_part_${partNum}.md`;
        files.push({ name, content: currentContent });
      }

      const writtenPaths: string[] = [];
      for (const file of files) {
        const filepath = join(dayDir, file.name);
        await fs.writeFile(filepath, file.content, "utf-8");
        writtenPaths.push(filepath);
      }

      const totalSize = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf-8"), 0);
      logger.info(
        `Block ${blockNum} exported to ${dayDir} (${files.length} file(s), ${Math.round(totalSize / 1024)} KB)`
      );

      this.exportPaths.set(sessionId, writtenPaths[0]);
      localDb.updateMonitoringSessionExportPath(sessionId, writtenPaths[0]);
      return writtenPaths[0];
    } catch (err) {
      logger.error("Failed to export session markdown:", String(err));
      return null;
    }
  }
}

export interface OnDeviceSummary {
  narrative: string;
  taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }>;
  timeBreakdown: Record<string, number> | null;
  modelUsed: string;
}

export const localInferenceService = new LocalInferenceService();
