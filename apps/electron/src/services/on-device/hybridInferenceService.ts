/**
 * BYOK Inference Service
 *
 * Uses the user's own API key (Google/OpenAI/Anthropic) stored in keyVault
 * for all AI inference: batch frame analysis and session summarization.
 *
 * On-device Whisper handles audio transcription separately.
 *
 * If no BYOK key is configured, raw captures and audio are saved but
 * no AI analysis runs.
 *
 * @deprecated Ollama/local inference code is retained but dead-pathed.
 * It will be removed in Phase 2.
 */

import { createLogger } from "../../lib/logger";
import type { BufferedFrame } from "./localInferenceService";
import { pgDb } from "./pgDb";
import { sessionTimeline, type TranscriptSegment } from "./sessionTimeline";
import { localAudioService } from "./localAudioService";
import { localFrameStorage } from "../localFrameStorage";
import { keyVault } from "./keyVault";
import { createProvider, type InferenceProvider } from "./providers";
import { isValidBase64Image } from "./providers/imageValidation";
import { runRLMLoop, type CompletionFn } from "./rlm/local-rlm-engine";
import { StorytellerEnvironment } from "./rlm/storyteller-rlm-environment";
import { STORYTELLER_TOOLS } from "./rlm/storyteller-rlm-tools";
import {
  getStorytellerSystemPrompt,
  getStorytellerUserPrompt,
} from "./rlm/storyteller-rlm-prompts";
import { promises as fs } from "fs";
import { join } from "path";
import { app } from "electron";
import { randomUUID } from "crypto";
import { aggregateSession } from "./blockAggregator";

const logger = createLogger("HybridInference");

export interface BatchAnalysisResult {
  frameDescriptions: Array<{
    sequenceNumber: number;
    description: string;
    userAction: string | null;
  }>;
  batchNarrative: string;
}

export interface InferenceTier {
  type: "cloud";
  reason: string;
}

class HybridInferenceService {
  private currentTier: InferenceTier | null = null;
  private currentMdPath: string | null = null;
  private currentUserId: string | undefined = undefined;
  private sessionStartMs: number = 0;
  private provider: InferenceProvider | null = null;

  private async getBlockDataDir(sessionDate: Date): Promise<string> {
    const userDataDir = app.getPath("userData");
    const yyyy = sessionDate.getFullYear();
    const mm = String(sessionDate.getMonth() + 1).padStart(2, "0");
    const dd = String(sessionDate.getDate()).padStart(2, "0");
    const dayFolder = `${yyyy}-${mm}-${dd}`;

    const parts = [userDataDir, "block_data"];
    try {
      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      if (activeId) {
        const account = await pgDb.getLocalAccountById(activeId);
        if (account?.email) {
          parts.push(account.email.replace(/[<>:"/\\|?*]/g, "_"));
        }
      }
    } catch {
      // fallback to no user subfolder
    }
    parts.push(dayFolder);
    return join(...parts);
  }

  /**
   * Create block.md file at SESSION START.
   * Called early so transcripts and activity can be appended during the session.
   */
  async createBlockMarkdown(
    sessionId: string,
    startedAt: number,
    sessionGoal?: string,
    _userId?: string
  ): Promise<string | null> {
    this.sessionStartMs = startedAt;

    try {
      const sessionDate = new Date(startedAt);
      const dayDir = await this.getBlockDataDir(sessionDate);

      await fs.mkdir(dayDir, { recursive: true });

      let blockNum = 1;
      try {
        const todayStart = new Date(startedAt);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = todayStart.getTime() + 24 * 60 * 60 * 1000;
        const sessions = await pgDb.getAllSessionsByDateRange(todayStart.getTime(), todayEnd);
        blockNum = Math.max(sessions.length, 1);
      } catch {
        // DB not ready or no sessions - default to 1
      }

      logger.info(`Creating block_${blockNum}.md in ${dayDir}`);

      const startTime = sessionDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      const header = [
        `# Mitable Block ${blockNum}`,
        ``,
        `- **Date:** ${sessionDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
        `- **Started:** ${startTime}`,
        `- **Session Goal:** ${sessionGoal || "General work session"}`,
        `- **Session:** ${sessionId}`,
        ``,
        `---`,
        ``,
        `## Detailed Activity Log`,
        ``,
        `*Activity will be recorded as the session progresses...*`,
        ``,
      ].join("\n");

      const mdFilePath = join(dayDir, `block_${blockNum}.md`);
      await fs.writeFile(mdFilePath, header, "utf-8");

      this.currentMdPath = mdFilePath;

      // Update pgDb with export path
      try {
        await pgDb.setExportPath(sessionId, mdFilePath);
      } catch {
        // DB might not be ready yet, that's ok
      }

      logger.info(`Block markdown created at session start: ${mdFilePath}`);
      return mdFilePath;
    } catch (err) {
      logger.error("Failed to create block markdown at session start:", String(err));
      return null;
    }
  }

  /**
   * Get the current markdown path (for appending transcripts during session).
   */
  getMarkdownPath(): string | null {
    return this.currentMdPath;
  }

  /**
   * Append a transcript segment to block.md during the session.
   */
  async appendTranscript(
    text: string,
    source: "user" | "remote",
    startOffsetMs: number,
    endOffsetMs: number
  ): Promise<void> {
    if (!this.currentMdPath) return;

    const wallStart = new Date(this.sessionStartMs + startOffsetMs).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
    const wallEnd = new Date(this.sessionStartMs + endOffsetMs).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
    const speaker = source === "user" ? "You" : "Remote";

    const line = `> **Audio (${wallStart} – ${wallEnd}):** ${speaker}: ${text}\n\n`;

    try {
      await fs.appendFile(this.currentMdPath, line, "utf-8");
    } catch (err) {
      logger.warn("Failed to append transcript to markdown:", String(err));
    }
  }

  /**
   * Initialize inference — loads BYOK provider from keyVault.
   */
  async initialize(_sessionId: string): Promise<InferenceTier> {
    const providerConfig = await keyVault.load();

    if (!providerConfig) {
      this.currentTier = { type: "cloud", reason: "No API key configured" };
      this.provider = null;
      logger.warn("No BYOK provider configured — AI analysis will be skipped");
      return this.currentTier;
    }

    this.provider = createProvider(
      providerConfig.provider,
      providerConfig.apiKey,
      providerConfig.model
    );
    this.currentTier = { type: "cloud", reason: `BYOK: ${providerConfig.provider}` };

    logger.info(`Using BYOK inference (${this.provider.name} / ${this.provider.model})`);
    return this.currentTier;
  }

  /**
   * Process entire session at end — hybrid orchestration.
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
    logger.info(`Hybrid processAllAtEnd starting for session ${sessionId}`);

    // Look up the active local user once so the cloud prompt can ground itself
    // in the user's identity (avoid "user meets user"-style hallucination).
    try {
      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      this.currentUserId = activeId ?? undefined;
    } catch {
      this.currentUserId = undefined;
    }

    const emit = (
      step: string,
      percent: number,
      label: string,
      extra?: { batchIndex?: number; totalBatches?: number }
    ) => {
      onProgress?.({ sessionId, step, percent, label, ...extra });
    };

    emit("loading_manifest", 2, "Loading session data...");

    // Load timeline and frame manifest
    const timeline = sessionTimeline.load(sessionDir) ?? sessionTimeline.get();
    const manifest = await localFrameStorage.loadManifest(sessionId);
    if (!manifest || manifest.frames.length === 0) {
      logger.warn("No frames found for session", sessionId);
      return;
    }

    const sessionStartMs = timeline?.sessionStartMs ?? new Date(manifest.startedAt).getTime();
    this.sessionStartMs = sessionStartMs;
    const allFrameMeta = manifest.frames;
    logger.info(`Found ${allFrameMeta.length} frames on disk`);

    // Use existing markdown file (created at session start) or create fallback
    let mdPath = this.currentMdPath;
    if (!mdPath) {
      logger.warn("No markdown file from session start — creating fallback now");
      mdPath = await this.initMarkdownFile(sessionId, sessionStartMs, allFrameMeta);
      this.currentMdPath = mdPath;
    } else {
      logger.info(`Using existing block.md: ${mdPath}`);
      // Update the placeholder text now that we have frame count
      try {
        const content = await fs.readFile(mdPath, "utf-8");
        const updated = content.replace(
          "*Activity will be recorded as the session progresses...*",
          `*${allFrameMeta.length} frames captured*`
        );
        await fs.writeFile(mdPath, updated, "utf-8");
      } catch {
        // Non-critical
      }
    }

    if (!mdPath) {
      logger.error("Failed to create block.md — summaries will not be written to disk");
    }

    emit("loading_model", 5, "Initializing inference...");
    await this.initialize(sessionId);

    if (!this.provider) {
      logger.warn("No BYOK provider — skipping AI analysis");
      emit("complete", 100, "No AI provider configured. Add your API key in Settings.");
      return;
    }

    // Get transcript segments
    const allTranscripts = localAudioService.getAccumulatedTranscripts();
    const hasStreamedAudio = allTranscripts.length > 0;

    emit("transcribing", 12, "Processing audio transcripts...");

    // Store transcripts in DB if not already there
    const existingTranscripts = await pgDb.getTranscriptionsForSession(sessionId);
    if (existingTranscripts.length === 0 && hasStreamedAudio) {
      for (let i = 0; i < allTranscripts.length; i++) {
        const seg = allTranscripts[i];
        await pgDb.insertTranscription({
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
    }

    emit("transcribing", 18, "Audio processing complete");

    try {
      // Process frames in batches
      const BATCH_SIZE = 20;
      const totalBatches = Math.ceil(allFrameMeta.length / BATCH_SIZE);
      const batchNarratives: string[] = [];

      // Check for existing classifications (resumable)
      const existingClassifications = await pgDb.getClassificationsForSession(sessionId);
      const processedBatchIndices = new Set(existingClassifications.map((c) => c.batchIndex));

      if (processedBatchIndices.size > 0) {
        logger.info(
          `Resuming: ${processedBatchIndices.size}/${totalBatches} batches already processed`
        );
      }

      for (
        let offset = 0, batchIdx = 0;
        offset < allFrameMeta.length;
        offset += BATCH_SIZE, batchIdx++
      ) {
        const batchMeta = allFrameMeta.slice(offset, offset + BATCH_SIZE);

        // Skip already processed batches
        if (processedBatchIndices.has(batchIdx)) {
          logger.info(`Batch ${batchIdx}: already processed — skipping`);
          continue;
        }

        const batchPercent = 20 + Math.round((batchIdx / totalBatches) * 60);
        emit(
          "processing_batch",
          batchPercent,
          `Analyzing frames (${batchIdx + 1} of ${totalBatches})...`,
          { batchIndex: batchIdx, totalBatches }
        );

        // Load frame images
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
            intervalEvidence: frameMeta.intervalEvidence,
            browserContext: frameMeta.browserContext,
          });
        }

        if (batch.length === 0) continue;

        logger.info(
          `Batch ${batchIdx}: ${batch.length} frames (seq ${batch[0].sequenceNumber}-${batch[batch.length - 1].sequenceNumber})`
        );

        // Match transcript segments
        const batchStartOffset = batch[0].offsetMs;
        const batchEndOffset = batch[batch.length - 1].offsetMs;
        const matchedTranscripts = hasStreamedAudio
          ? allTranscripts.filter(
              (seg) => seg.endOffsetMs > batchStartOffset && seg.startOffsetMs < batchEndOffset
            )
          : [];
        const transcriptText = matchedTranscripts
          .map((seg) => `${seg.source === "user" ? "User" : "Remote"}: ${seg.text}`)
          .join("\n");

        // Analyze batch (routes to local or cloud)
        const result = await this.analyzeBatch(batch, transcriptText, this.currentUserId);
        batchNarratives.push(result.batchNarrative);

        // Store captures
        for (const frame of batch) {
          const frameDesc = result.frameDescriptions.find(
            (fd) => fd.sequenceNumber === frame.sequenceNumber
          );
          const ev = frame.intervalEvidence;
          await pgDb.insertCapture({
            id: randomUUID(),
            sessionId: frame.sessionId,
            frameId: frame.frameId,
            sequenceNumber: frame.sequenceNumber,
            capturedAt: frame.capturedAt,
            windowId: frame.windowId,
            appName: frame.appName,
            windowTitle: frame.windowTitle,
            sensorOutput: frameDesc?.description ?? `[${frame.appName}] ${frame.windowTitle}`,
            deltaChanged: (ev?.keyboardEventCount ?? 0) > 0 || (ev?.mouseClickCount ?? 0) > 0,
            changeType:
              (ev?.keyboardEventCount ?? 0) > 0 || (ev?.mouseClickCount ?? 0) > 0
                ? "user_interaction"
                : "passive_view",
            userAction: frameDesc?.userAction ?? null,
          });
        }

        // Store classification
        await pgDb.insertClassification({
          id: randomUUID(),
          sessionId,
          batchIndex: batchIdx,
          startSequence: batch[0].sequenceNumber,
          endSequence: batch[batch.length - 1].sequenceNumber,
          activityDescription: result.batchNarrative,
          activityType: null,
          onTask: true,
          taskRelevance: null,
          importanceScore: 0.5,
          rawOutput: "",
        });

        // Append batch to markdown
        if (mdPath) {
          await this.appendBatchToMarkdown(
            mdPath,
            batchIdx,
            batch,
            result.frameDescriptions,
            matchedTranscripts,
            result.batchNarrative,
            sessionStartMs
          );
        }

        logger.info(`Batch ${batchIdx} complete: ${result.batchNarrative.slice(0, 120)}`);
      }

      // Generate task breakdown via storyteller RLM (iterative tool loop)
      const existingStory = await pgDb.getStoryForSession(sessionId);
      if (existingStory) {
        logger.info("Task breakdown already exists — skipping");
      } else {
        emit("generating_summary", 85, "Building task breakdown...");
        const tasks = await this.generateStorytellerTasks(sessionId);
        await pgDb.insertStory({
          id: randomUUID(),
          sessionId,
          narrative: "",
          tasks: JSON.stringify(tasks),
          timeBreakdown: null,
          modelUsed: this.provider?.model ?? "byok",
        });
      }

      // Aggregate classifications into structured activity blocks + daily summary
      emit("aggregating_blocks", 92, "Building activity blocks...");
      try {
        const blockCompletionFn: CompletionFn | null = this.provider
          ? async (msgs, opts) => {
              return this.provider!.chatCompletion(
                msgs.map((m) => ({ role: m.role, content: m.content })),
                {
                  temperature: opts?.temperature ?? 0.1,
                  max_tokens: opts?.max_tokens ?? 2048,
                  format: opts?.format ?? "json",
                }
              );
            }
          : null;
        await aggregateSession(sessionId, blockCompletionFn);
      } catch (err) {
        logger.error("Block aggregation failed (non-fatal):", String(err));
      }

      emit("complete", 100, "Done");
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      logger.info(`Hybrid processAllAtEnd completed in ${elapsed}s`);
    } finally {
      // No cleanup needed for BYOK
    }
  }

  /**
   * Analyze a batch of frames via BYOK provider.
   */
  private async analyzeBatch(
    frames: BufferedFrame[],
    transcriptSegments: string,
    userId?: string
  ): Promise<BatchAnalysisResult> {
    if (!this.provider) {
      throw new Error("No BYOK provider configured");
    }
    return this.analyzeBatchCloud(frames, transcriptSegments, userId);
  }

  /**
   * Generate task breakdown using the storyteller RLM (iterative tool loop).
   * Reads block.md via tools and returns a structured list of tasks.
   */
  private async generateStorytellerTasks(
    sessionId: string
  ): Promise<Array<{ shortTitle: string; description: string; minutes: number }>> {
    if (!this.provider) {
      logger.warn("No BYOK provider for storyteller RLM");
      return [];
    }

    const mdPath = this.currentMdPath;
    if (!mdPath) {
      logger.warn("No block.md path — cannot run storyteller");
      return [];
    }

    let blockContent: string;
    try {
      blockContent = await fs.readFile(mdPath, "utf-8");
      logger.info(`Storyteller: read ${blockContent.length} chars from ${mdPath}`);
    } catch (err) {
      logger.error("Failed to read block.md for storyteller:", String(err));
      return [];
    }

    if (blockContent.length < 100) {
      return [];
    }

    const env = new StorytellerEnvironment({ sessionId, blockContent });

    logger.info(
      `Storyteller RLM: ${env.metadata.totalLines} lines, ${env.metadata.batchCount} batches, ${env.metadata.transcriptCount} transcripts`
    );

    const provider = this.provider;
    const completionFn: CompletionFn = async (msgs, opts) => {
      return provider.chatCompletion(
        msgs.map((m) => ({ role: m.role, content: m.content })),
        {
          temperature: opts?.temperature ?? 0.2,
          max_tokens: opts?.max_tokens ?? 2048,
          format: opts?.format ?? "json",
        }
      );
    };

    const result = await runRLMLoop<
      StorytellerEnvironment,
      { tasks: Array<{ shortTitle: string; description: string; minutes: number }> }
    >(
      getStorytellerSystemPrompt(),
      getStorytellerUserPrompt(env.metadata.totalLines),
      STORYTELLER_TOOLS,
      env,
      {
        maxIterations: 15,
        doneResultField: "summary",
        temperature: 0.3,
        maxTokens: 4096,
        completionFn,
      }
    );

    const tasks = result.result?.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      logger.warn("Storyteller RLM returned no tasks");
      return [];
    }

    const validated = tasks
      .filter((t) => t && typeof t.shortTitle === "string" && typeof t.description === "string")
      .map((t) => ({
        shortTitle: String(t.shortTitle).slice(0, 50),
        description: String(t.description),
        minutes: typeof t.minutes === "number" ? Math.max(1, Math.round(t.minutes)) : 1,
      }));

    logger.info(`Storyteller RLM produced ${validated.length} tasks`);
    return validated;
  }

  getCurrentTier(): InferenceTier | null {
    return this.currentTier;
  }

  getProvider(): InferenceProvider | null {
    return this.provider;
  }

  isCloudConfigured(): boolean {
    return this.provider !== null;
  }

  resetSessionState(): void {
    this.currentMdPath = null;
    this.sessionStartMs = 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BYOK Cloud Path
  // ──────────────────────────────────────────────────────────────────────────

  private async analyzeBatchCloud(
    frames: BufferedFrame[],
    transcriptSegments: string,
    userId?: string
  ): Promise<BatchAnalysisResult> {
    if (!this.provider) {
      throw new Error("No BYOK provider configured for cloud batch analysis");
    }

    const metadataLines = frames.map((f, i) => {
      const ev = f.intervalEvidence;
      const parts: string[] = [];
      if (ev?.keyboardEventCount) parts.push(`${ev.keyboardEventCount} keys`);
      if (ev?.mouseClickCount) parts.push(`${ev.mouseClickCount} clicks`);
      if (ev?.copyCount) parts.push(`${ev.copyCount} copies`);
      if (ev?.pasteCount) parts.push(`${ev.pasteCount} pastes`);

      const wallClock = new Date(f.capturedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      return `Frame ${i + 1} (${wallClock}): ${f.appName} - ${f.windowTitle}${parts.length ? ` (${parts.join(", ")})` : ""}`;
    });

    // Resolve the user's display name so we can ground the model and avoid
    // "user is in a meeting with user" hallucinations.
    let userDisplayName = "";
    if (userId) {
      try {
        const account = await pgDb.getLocalAccountById(userId);
        if (account) {
          const full = [account.firstName, account.lastName].filter(Boolean).join(" ").trim();
          if (full) userDisplayName = full;
          else if (account.email) userDisplayName = account.email.split("@")[0];
        }
      } catch {
        // Non-fatal — prompt just won't include the name
      }
    }

    const hasTranscripts = transcriptSegments.trim().length > 0;

    const promptText = `Analyze ${frames.length} sequential screenshots from a work session.

${
  userDisplayName
    ? `THE USER VIEWING THESE SCREENS IS: ${userDisplayName}
The user is one of the people on screen. If a participant's name in a meeting matches the user, they are the SAME PERSON — describe them in the third person but do not treat them as a separate colleague.
`
    : ""
}Per-frame metadata (the wall-clock time is the real capturedAt of the frame, not a time read off the image):
${metadataLines.join("\n")}

${hasTranscripts ? `Audio transcripts during this period (these are real — trust them):\n${transcriptSegments}\n\n` : `No audio transcripts are available for this batch — there is NO audio data. Do not describe voice, speech, mic activity, screen-sharing audio, or what anyone "said". A highlighted mic button is a UI state, not proof of audio.\n`}
Hard rules — read carefully:

1. NO FABRICATED AUDIO. If transcripts are not provided above, do not describe anyone's voice, what was "said", who "spoke", or whether the microphone is "active". Button states are UI affordances, not events.
2. NO INVENTED TIMESTAMPS. The wall-clock time shown in the metadata is the real capturedAt of the screenshot. If a clock on screen shows a different time (a meeting timer, a stale system tray, a tab clock), it is NOT the time of the frame — use the metadata time, not the visible clock.
3. NO INVENTED DURATIONS. Do not write "this spans 2 hours" or "this took 30 minutes". Describe only what is on screen. If the timestamps tell you something concrete (e.g. 20 screenshots across 60 seconds), say that.
4. COPY IDs AND NAMES EXACTLY. If you see "VIT1500389", write "VIT1500389" — do not turn it into "VIT15003899" or "VIT1500399". If a name is "Aurel Npounengnong", write it that way. The model has been observed to hallucinate extra/missing digits and reorder name parts — be strict.
5. NO EXTRANEOUS FRAMING. Do not write "A Microsoft Teams meeting was in progress" as if a third party were describing it. Either write from the user's perspective ("In a Teams meeting, …") or describe what is literally on screen.
6. DO NOT INFER PARTICIPATION FROM UI STATES. A highlighted mic icon does not mean someone is speaking. A "Raise Hand" button being visible does not mean anyone raised their hand. Report only what is concretely visible (names in the participant list, a chat message, a screen-share indicator with content).

Per-frame instructions — read the CONTENT, not just the container:

- VIDEO/MEDIA: Read the video title, channel name, topic. What is the content about?
- CODE EDITOR: Read file names in tabs/sidebar, function/class names visible in code, language. Is there a terminal with errors, build output, or test results? Is there an AI chat panel (Cursor, Copilot, ChatGPT) — what's the conversation about?
- IDE CONTEXT: What's in the file explorer? Any git diff views? What branch? What files changed?
- MEETINGS/CALLS: List the visible participants by name. What app? Is there a shared screen, presentation, or agenda visible? If you can read chat messages, summarise them. If transcripts are present, integrate them.
- BROWSER: What site and page? Article titles, search queries, form content, documentation topics?
- EMAIL/MESSAGING: Who's the conversation with? Subject line? What's being discussed?
- ISSUE TRACKERS: Jira/Linear/GitHub issue title and number? Status?
- DOCUMENTS: Document title, section headings, content being edited?
- CLIENT/CUSTOMER CONTEXT: Any visible client or company names, logos, project names, Slack channel names (e.g., #acme-support), ticket prefixes, or other indicators of who this work is for?

Scale detail to richness: a static idle screen = 1 sentence. A rich IDE with code, terminal, sidebar, and chat = 3-4 sentences covering each visible element.

Then write a batchNarrative summarising WHAT was being worked on across all frames — the subject matter, not just which apps were open. Keep the narrative grounded in observable evidence; do not pad with invented context.

Return JSON:
{
  "frameDescriptions": [
    {"sequenceNumber": 1, "description": "...", "userAction": "typing/editing/etc"},
    ...
  ],
  "batchNarrative": "Summary of what was being worked on across all frames..."
}`;

    // Pre-flight: drop frames whose base64 payload won't decode, log and move on.
    // Don't retry the whole batch for one bad image — that wastes API calls and
    // can hang a single batch indefinitely (see incident 2026-06-04 Batch 3).
    const validFrames: BufferedFrame[] = [];
    const skippedSeqs: number[] = [];
    for (const f of frames) {
      if (isValidBase64Image(f.imageBase64)) {
        validFrames.push(f);
      } else {
        skippedSeqs.push(f.sequenceNumber);
        logger.warn(`analyzeBatchCloud: dropping frame seq=${f.sequenceNumber} (invalid base64)`);
      }
    }

    if (validFrames.length === 0) {
      logger.warn("analyzeBatchCloud: no valid frames in batch — returning fallback");
      return {
        frameDescriptions: frames.map((f) => ({
          sequenceNumber: f.sequenceNumber,
          description: `[${f.appName}] ${f.windowTitle}`,
          userAction: null,
        })),
        batchNarrative: "Activity recorded (frames unreadable).",
      };
    }

    if (skippedSeqs.length > 0) {
      logger.info(
        `analyzeBatchCloud: sending ${validFrames.length}/${frames.length} frames ` +
          `(skipped seq: ${skippedSeqs.join(", ")})`
      );
    }

    const imageContent = validFrames.map((frame) => ({
      type: "image_url" as const,
      image_url: {
        url: frame.imageBase64.startsWith("data:")
          ? frame.imageBase64
          : `data:image/png;base64,${frame.imageBase64}`,
      },
    }));

    const text = await this.provider.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a detailed screen analyst. Read everything visible: text, titles, names, code, UI elements. Return valid JSON only.",
        },
        {
          role: "user",
          content: [{ type: "text", text: promptText }, ...imageContent],
        },
      ],
      { temperature: 0.2, max_tokens: 4096, format: "json" }
    );

    try {
      const parsed = JSON.parse(text) as BatchAnalysisResult;
      // Remap 1-indexed relative sequenceNumbers back to the actual frame
      // sequenceNumbers (only for frames we actually sent).
      for (let i = 0; i < parsed.frameDescriptions.length; i++) {
        if (i < validFrames.length) {
          parsed.frameDescriptions[i].sequenceNumber = validFrames[i].sequenceNumber;
        }
      }
      // Append a placeholder for any frame we couldn't send so callers see
      // every original sequence number in the captures table.
      for (const seq of skippedSeqs) {
        const original = frames.find((f) => f.sequenceNumber === seq);
        parsed.frameDescriptions.push({
          sequenceNumber: seq,
          description: `[${original?.appName ?? "Unknown"}] ${original?.windowTitle ?? ""}`.trim(),
          userAction: null,
        });
      }
      return parsed;
    } catch {
      logger.warn("Failed to parse provider JSON response, returning fallback");
      return {
        frameDescriptions: frames.map((f) => ({
          sequenceNumber: f.sequenceNumber,
          description: `[${f.appName}] ${f.windowTitle}`,
          userAction: null,
        })),
        batchNarrative: "Activity recorded.",
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Markdown Export (block.md generation)
  // ──────────────────────────────────────────────────────────────────────────

  private async initMarkdownFile(
    sessionId: string,
    sessionStartMs: number,
    frameMeta: Array<{ timestamp: string; appName: string }>
  ): Promise<string | null> {
    try {
      const sessionDate = new Date(sessionStartMs);
      const dayDir = await this.getBlockDataDir(sessionDate);
      await fs.mkdir(dayDir, { recursive: true });

      let blockNum = 1;
      try {
        const todayStart = new Date(sessionStartMs);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = todayStart.getTime() + 24 * 60 * 60 * 1000;
        const sessions = await pgDb.getAllSessionsByDateRange(todayStart.getTime(), todayEnd);
        blockNum = Math.max(sessions.length, 1);
      } catch {
        // DB not ready - default to 1
      }

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

      await pgDb.setExportPath(sessionId, mdFilePath);

      logger.info(`Streaming .md created: ${mdFilePath}`);
      return mdFilePath;
    } catch (err) {
      logger.error("Failed to init markdown file:", String(err));
      return null;
    }
  }

  private async appendBatchToMarkdown(
    mdPath: string,
    _batchIdx: number,
    batch: BufferedFrame[],
    frameDescriptions: Array<{
      sequenceNumber: number;
      description: string;
      userAction: string | null;
    }>,
    transcripts: TranscriptSegment[],
    batchNarrative: string,
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
      const engine =
        this.provider?.name === "google"
          ? "Gemini"
          : this.provider?.name === "anthropic"
            ? "Claude"
            : this.provider?.name === "openai"
              ? "GPT"
              : "AI";
      lines.push(`### ${batchStart} – ${batchEnd} (${batch.length} frames) — *${engine}*\n`);

      if (batchNarrative) {
        lines.push(`**Summary:** ${batchNarrative}\n`);
      }

      // Build chronological events: frame descriptions + transcript segments
      interface TimeEvent {
        offsetMs: number;
        wallClock: string;
        type: "frame" | "transcript";
        content: string;
      }

      const events: TimeEvent[] = [];

      // Add frame descriptions with activity evidence
      for (const frame of batch) {
        const fd = frameDescriptions.find((d) => d.sequenceNumber === frame.sequenceNumber);
        const desc = fd?.description ?? `${frame.appName} — ${frame.windowTitle}`;
        const action = fd?.userAction ? ` [${fd.userAction}]` : "";
        const wallClock = new Date(frame.capturedAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        });

        // Build activity evidence inline
        const ev = frame.intervalEvidence;
        const actParts: string[] = [];
        if (ev?.keyboardEventCount) actParts.push(`${ev.keyboardEventCount} keys`);
        if (ev?.mouseClickCount) actParts.push(`${ev.mouseClickCount} clicks`);
        if (ev?.mouseScrollCount) actParts.push(`${ev.mouseScrollCount} scrolls`);
        if (ev?.copyCount) actParts.push(`${ev.copyCount} copies`);
        if (ev?.pasteCount) actParts.push(`${ev.pasteCount} pastes`);
        const actStr = actParts.length > 0 ? ` (${actParts.join(", ")})` : "";

        events.push({
          offsetMs: frame.offsetMs,
          wallClock,
          type: "frame",
          content: `- **${wallClock}** | ${frame.appName}${action}${actStr}: ${desc.length > 250 ? desc.slice(0, 250) + "…" : desc}`,
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

  // @ts-expect-error — reserved for future use, not yet called
  private async prependSummaryToMarkdown(mdPath: string, sessionId: string): Promise<void> {
    try {
      const story = await pgDb.getStoryForSession(sessionId);
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
      const captures = await pgDb.getCapturesForSession(sessionId);
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
        const session = await pgDb.getMonitoringSession(sessionId);
        const updatedContent = withSummary
          .replace(
            /- \*\*Started:\*\* .+/,
            `- **Time:** ${startTime} – ${endTime} (${durationMin} min)`
          )
          .replace(
            /- \*\*Session Goal:\*\* .+/,
            `- **Session Goal:** ${session?.sessionGoal ?? "General work session"}`
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
}

export const hybridInferenceService = new HybridInferenceService();
