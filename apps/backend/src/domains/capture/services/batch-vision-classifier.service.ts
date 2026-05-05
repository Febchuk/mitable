/**
 * Batch Vision Classifier Service
 *
 * Merged sensor + classifier in a single Gemini 2.5 Flash call.
 * Accepts up to 30 frames (the full batch) with metadata and optional
 * transcript, returns per-frame structured analysis in one shot.
 *
 * Token budget for 30 × 1080p screenshots:
 *   30 images × ~1,548 tokens = ~46K image tokens
 *   + metadata/prompt/transcript  = ~5-10K tokens
 *   Total: ~55K tokens (5% of 1M context window)
 *
 * Model: gemini-2.5-flash ($0.30/1M input, $2.50/1M output)
 * Effective cost per 30-frame batch: ~$0.02
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config.js";
import { withRetry } from "../../../utils/retry.js";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "batch-vision-classifier" });

const MODEL = "gemini-2.5-flash";
const MAX_FRAMES_PER_CALL = 30;

export interface BatchFrame {
  frameId: string;
  imageBase64: string;
  windowInfo: { windowSourceId: string; appName: string; windowTitle: string };
  sequenceNumber: number;
  capturedAt: number;
  intervalEvidence?: {
    keyboardEventCount: number;
    copyCount: number;
    pasteCount: number;
    cutCount: number;
    mouseClickCount: number;
    mouseScrollCount: number;
  };
  browserContext?: { activeTabUrl: string; activeTabTitle: string; tabCount: number };
}

export interface BatchFrameResult {
  frameId: string;
  changed: boolean;
  changeType: "text_input" | "scroll" | "window_switch" | "click" | "navigation" | "none";
  description: string;
  activity: string;
  confidence: number;
  isContinuation: boolean;
  onTask: boolean;
  importanceScore: number;
}

export interface BatchAnalysisResult {
  frames: BatchFrameResult[];
  batchNarrative: string;
  model: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const BATCH_SYSTEM_PROMPT = `<role>
You are a precise screen activity analyzer for a work monitoring system. You receive a chronological sequence of screenshots from a work session along with metadata (window titles, app names, input activity counts, timestamps) and optionally an audio transcript snippet from the same time period.

Your job is to:
1. Analyze each frame and describe what the user is doing based on the visual content.
2. Detect meaningful changes between consecutive frames.
3. Classify each frame's activity into a concise work log entry.
4. Produce a short narrative summary of the entire batch.
</role>

<output_rules>
- Read and transcribe visible text verbatim: names, messages, code, URLs, document titles, recipient names.
- Use visual intelligence to understand UI context (input boxes vs sent messages, chat headers, code editors, meeting UIs, etc.).
- Be specific: "Typed 'const user = await fetchUser()' in VS Code, line 42 of auth.ts" not "Edited code".
- For activity classification: use active verbs, max 12 words.
- If a frame shows no meaningful change from the previous (just clock ticks or minor rendering), mark changed=false.
- Determine on_task: productive work (coding, writing, communicating about work, researching) = true; leisure (social media, games, unrelated videos) = false.
- Importance: 0.1-0.3 for trivial/no change, 0.4-0.6 for minor changes, 0.7-0.9 for significant work actions.
- If transcript context is provided, use it to enrich your understanding of what the user is doing (e.g., if they say "let me debug this" while looking at code, classify as debugging).
- The batch_narrative should be 2-4 sentences summarizing the overall activity across all frames.
</output_rules>

<output_format>
Return a JSON object:
{
  "frames": [
    {
      "frame_index": 0,
      "changed": boolean,
      "change_type": "text_input" | "scroll" | "window_switch" | "click" | "navigation" | "none",
      "description": "Detailed literal description of what's visible and what changed (max 80 words)",
      "activity": "Concise human-readable activity (max 12 words)",
      "confidence": number (0-1),
      "is_continuation": boolean,
      "on_task": boolean,
      "importance_score": number (0-1)
    }
  ],
  "batch_narrative": "2-4 sentence summary of the overall batch activity"
}
</output_format>`;

class BatchVisionClassifierService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  /**
   * Analyze a batch of frames (up to 30) in a single Gemini 2.5 Flash call.
   * All 30 frames + metadata + optional transcript go in one request.
   */
  async analyzeBatch(
    frames: BatchFrame[],
    transcriptSnippet?: string
  ): Promise<BatchAnalysisResult> {
    if (frames.length === 0) {
      return {
        frames: [],
        batchNarrative: "",
        model: MODEL,
        latencyMs: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    if (frames.length > MAX_FRAMES_PER_CALL) {
      logger.warn(`Batch exceeds max (${frames.length}/${MAX_FRAMES_PER_CALL}), truncating`);
      frames = frames.slice(0, MAX_FRAMES_PER_CALL);
    }

    const startTime = Date.now();

    // Build per-frame metadata context
    const frameMetadata = frames
      .map((f, i) => {
        let meta = `Frame ${i} [seq=${f.sequenceNumber}, time=${new Date(f.capturedAt).toISOString()}]: app="${f.windowInfo.appName}" title="${f.windowInfo.windowTitle}"`;
        if (f.intervalEvidence) {
          const ev = f.intervalEvidence;
          const parts: string[] = [];
          if (ev.keyboardEventCount > 0) parts.push(`${ev.keyboardEventCount} keys`);
          if (ev.mouseClickCount > 0) parts.push(`${ev.mouseClickCount} clicks`);
          if (ev.mouseScrollCount > 0) parts.push(`${ev.mouseScrollCount} scrolls`);
          if (ev.pasteCount > 0) parts.push(`${ev.pasteCount} pastes`);
          if (ev.copyCount > 0) parts.push(`${ev.copyCount} copies`);
          if (parts.length > 0) meta += ` activity={${parts.join(", ")}}`;
        }
        if (f.browserContext) {
          meta += ` url="${f.browserContext.activeTabUrl}"`;
        }
        return meta;
      })
      .join("\n");

    let userPrompt = `Analyze these ${frames.length} sequential screenshots from a work monitoring session.\n\n<frame_metadata>\n${frameMetadata}\n</frame_metadata>`;

    if (transcriptSnippet && transcriptSnippet.trim().length > 0) {
      userPrompt += `\n\n<audio_transcript>\n${transcriptSnippet}\n</audio_transcript>`;
    }

    userPrompt += `\n\nReturn the JSON analysis for all ${frames.length} frames plus a batch_narrative.`;

    // Build parts: all images in order, then the combined prompt
    const parts: any[] = [];

    for (const frame of frames) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: frame.imageBase64,
        },
      });
    }

    parts.push({ text: `${BATCH_SYSTEM_PROMPT}\n\n${userPrompt}` });

    const model = this.genAI.getGenerativeModel({ model: MODEL });

    const response = await withRetry(
      async () => {
        return await model.generateContent({
          contents: [{ role: "user", parts }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.15,
            responseMimeType: "application/json",
          },
        });
      },
      "BatchVisionClassifier.analyzeBatch",
      { maxRetries: 2 }
    );

    const latencyMs = Date.now() - startTime;
    const result = response.response;
    const content = result.text() || "{}";

    const usageMetadata: any = result.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || promptTokens + completionTokens;

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(content);
      if (!parsed.frames || !Array.isArray(parsed.frames)) {
        throw new Error("Response missing frames array");
      }
    } catch (err) {
      logger.error(
        { error: String(err), content: content.slice(0, 500) },
        "Failed to parse batch response"
      );
      parsed = {
        frames: frames.map((_, i) => ({
          frame_index: i,
          changed: false,
          change_type: "none",
          description: "Analysis failed — parse error",
          activity: "Unknown activity",
          confidence: 0.3,
          is_continuation: false,
          on_task: true,
          importance_score: 0.3,
        })),
        batch_narrative: "Analysis failed due to response parsing error.",
      };
    }

    // Map parsed results back to frames
    const frameResults: BatchFrameResult[] = frames.map((frame, i) => {
      const item = parsed.frames[i] || parsed.frames.find((p: any) => p.frame_index === i);
      if (!item) {
        return {
          frameId: frame.frameId,
          changed: false,
          changeType: "none" as const,
          description: "No analysis returned for this frame",
          activity: "Unknown",
          confidence: 0.3,
          isContinuation: false,
          onTask: true,
          importanceScore: 0.3,
        };
      }

      return {
        frameId: frame.frameId,
        changed: !!item.changed,
        changeType: item.change_type || "none",
        description: item.description || "",
        activity: item.activity || "Unknown",
        confidence: item.confidence ?? 0.5,
        isContinuation: !!item.is_continuation,
        onTask: item.on_task !== false,
        importanceScore: item.importance_score ?? 0.3,
      };
    });

    logger.info(
      { model: MODEL, totalTokens, changedCount: frameResults.filter((f) => f.changed).length },
      `Batch analyzed ${frames.length} frames in ${latencyMs}ms (1 API call)`
    );

    return {
      frames: frameResults,
      batchNarrative: parsed.batch_narrative || "",
      model: MODEL,
      latencyMs,
      usage: { promptTokens, completionTokens, totalTokens },
    };
  }

  isAvailable(): boolean {
    return !!config.gemini.apiKey;
  }
}

export const batchVisionClassifierService = new BatchVisionClassifierService();
