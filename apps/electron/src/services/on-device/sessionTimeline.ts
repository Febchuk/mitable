/**
 * Session Timeline Ledger
 *
 * Source of truth for temporal alignment across the entire session.
 * Three independent clocks anchored to a single sessionStartMs:
 *
 *   1. Session clock  — wall-clock start/end, master anchor
 *   2. Frame clock    — expected vs actual captures, each with offsetMs
 *   3. Audio clock    — mic on/off offsets, per-segment metadata
 *
 * All offsets are relative to sessionStartMs (absolute Unix timestamp).
 * Persisted as timeline.json in the session's AppData directory.
 * Updated incrementally during recording — crash-safe.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createLogger } from "../../lib/logger";

const logger = createLogger("SessionTimeline");

// ── Types ───────────────────────────────────────────────────────────────────

export interface AudioSegmentMeta {
  index: number;
  startOffsetMs: number;
  endOffsetMs: number;
  byteOffset: number;
  byteLength: number;
  source: "user" | "remote";
  transcribed: boolean;
}

export interface TranscriptSegment {
  startOffsetMs: number;
  endOffsetMs: number;
  text: string;
  source: "user" | "remote";
}

export interface FrameTimestamp {
  sequenceNumber: number;
  offsetMs: number;
}

export interface MicSwitchEvent {
  offsetMs: number;
  deviceId: string | null;
  deviceName: string;
}

export interface SessionTimelineData {
  sessionId: string;
  sessionStartMs: number;
  sessionEndMs: number | null;

  frameCaptureIntervalMs: number;
  frameTimestamps: FrameTimestamp[];

  audioStartOffsetMs: number | null;
  audioEndOffsetMs: number | null;
  audioSegments: AudioSegmentMeta[];
  micSwitches: MicSwitchEvent[];

  transcriptSegments: TranscriptSegment[];
}

// ── Service ─────────────────────────────────────────────────────────────────

class SessionTimeline {
  private data: SessionTimelineData | null = null;
  private filePath: string | null = null;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new timeline when the user clicks Record.
   * sessionStartMs is the absolute Unix timestamp anchor.
   */
  create(sessionId: string, sessionDir: string, captureIntervalMs: number): void {
    const dir = join(sessionDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.filePath = join(dir, "timeline.json");
    this.data = {
      sessionId,
      sessionStartMs: Date.now(),
      sessionEndMs: null,
      frameCaptureIntervalMs: captureIntervalMs,
      frameTimestamps: [],
      audioStartOffsetMs: null,
      audioEndOffsetMs: null,
      audioSegments: [],
      micSwitches: [],
      transcriptSegments: [],
    };

    this.persist();

    this.flushTimer = setInterval(() => {
      if (this.dirty) this.persist();
    }, 5_000);

    logger.info(`Timeline created for session ${sessionId} at ${this.data.sessionStartMs}`);
  }

  /**
   * Load an existing timeline from disk (for post-session processing).
   */
  load(sessionDir: string): SessionTimelineData | null {
    const filePath = join(sessionDir, "timeline.json");
    if (!existsSync(filePath)) {
      logger.warn("No timeline.json found in", sessionDir);
      return null;
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      this.data = JSON.parse(raw) as SessionTimelineData;
      // Backfill for timelines created before micSwitches existed
      if (!this.data.micSwitches) this.data.micSwitches = [];
      this.filePath = filePath;
      logger.info(
        `Timeline loaded: session ${this.data.sessionId}, ${this.data.frameTimestamps.length} frames`
      );
      return this.data;
    } catch (err) {
      logger.error("Failed to load timeline.json:", String(err));
      return null;
    }
  }

  get(): SessionTimelineData | null {
    return this.data;
  }

  getSessionStartMs(): number {
    return this.data?.sessionStartMs ?? 0;
  }

  // ── Frame clock ─────────────────────────────────────────────────────────

  recordFrame(sequenceNumber: number): void {
    if (!this.data) return;
    const offsetMs = Date.now() - this.data.sessionStartMs;
    this.data.frameTimestamps.push({ sequenceNumber, offsetMs });
    this.dirty = true;
  }

  getExpectedFrameCount(): number {
    if (!this.data) return 0;
    const endMs = this.data.sessionEndMs ?? Date.now();
    const duration = endMs - this.data.sessionStartMs;
    return Math.floor(duration / this.data.frameCaptureIntervalMs);
  }

  getActualFrameCount(): number {
    return this.data?.frameTimestamps.length ?? 0;
  }

  getFrameOffsetMs(sequenceNumber: number): number | null {
    const entry = this.data?.frameTimestamps.find((f) => f.sequenceNumber === sequenceNumber);
    return entry?.offsetMs ?? null;
  }

  // ── Audio clock ─────────────────────────────────────────────────────────

  recordAudioStart(): void {
    if (!this.data) return;
    this.data.audioStartOffsetMs = Date.now() - this.data.sessionStartMs;
    this.dirty = true;
    logger.info(`Audio started at offset ${this.data.audioStartOffsetMs}ms`);
  }

  recordAudioEnd(): void {
    if (!this.data) return;
    this.data.audioEndOffsetMs = Date.now() - this.data.sessionStartMs;
    this.dirty = true;
    logger.info(`Audio ended at offset ${this.data.audioEndOffsetMs}ms`);
  }

  recordMicSwitch(deviceId: string | null, deviceName: string): void {
    if (!this.data) return;
    const offsetMs = Date.now() - this.data.sessionStartMs;
    this.data.micSwitches.push({ offsetMs, deviceId, deviceName });
    this.dirty = true;
    logger.info(`Mic switched to "${deviceName}" at offset ${offsetMs}ms`);
  }

  recordAudioSegment(segment: AudioSegmentMeta): void {
    if (!this.data) return;
    this.data.audioSegments.push(segment);
    this.dirty = true;
  }

  markSegmentTranscribed(index: number): void {
    if (!this.data) return;
    const seg = this.data.audioSegments.find((s) => s.index === index);
    if (seg) {
      seg.transcribed = true;
      this.dirty = true;
    }
  }

  // ── Transcript segments ─────────────────────────────────────────────────

  addTranscriptSegment(segment: TranscriptSegment): void {
    if (!this.data) return;
    this.data.transcriptSegments.push(segment);
    this.dirty = true;
  }

  /**
   * Get transcript segments that overlap with a time range.
   * Used to match audio to a batch of frames during post-processing.
   */
  getTranscriptsInRange(startOffsetMs: number, endOffsetMs: number): TranscriptSegment[] {
    if (!this.data) return [];
    return this.data.transcriptSegments.filter(
      (seg) => seg.endOffsetMs > startOffsetMs && seg.startOffsetMs < endOffsetMs
    );
  }

  getAllTranscriptSegments(): TranscriptSegment[] {
    return this.data?.transcriptSegments ?? [];
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  endSession(): void {
    if (!this.data) return;
    this.data.sessionEndMs = Date.now();
    this.persist();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    const durationSec = ((this.data.sessionEndMs - this.data.sessionStartMs) / 1000).toFixed(1);
    logger.info(
      `Session ended: ${durationSec}s, ${this.data.frameTimestamps.length} frames, ` +
        `${this.data.audioSegments.length} audio segments, ` +
        `${this.data.transcriptSegments.length} transcript segments`
    );
  }

  // ── Coverage stats (for timeline.json / diagnostics only) ───────────────

  getCoverageStats(): {
    frameCoverage: number;
    audioCoverageMs: number;
    sessionDurationMs: number;
  } {
    if (!this.data) return { frameCoverage: 0, audioCoverageMs: 0, sessionDurationMs: 0 };

    const endMs = this.data.sessionEndMs ?? Date.now();
    const sessionDurationMs = endMs - this.data.sessionStartMs;
    const expected = this.getExpectedFrameCount();
    const actual = this.getActualFrameCount();
    const frameCoverage = expected > 0 ? actual / expected : 1;

    let audioCoverageMs = 0;
    if (this.data.audioStartOffsetMs != null && this.data.audioEndOffsetMs != null) {
      audioCoverageMs = this.data.audioEndOffsetMs - this.data.audioStartOffsetMs;
    }

    return { frameCoverage, audioCoverageMs, sessionDurationMs };
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private persist(): void {
    if (!this.data || !this.filePath) return;
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
      this.dirty = false;
    } catch (err) {
      logger.error("Failed to persist timeline.json:", String(err));
    }
  }

  clear(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.data = null;
    this.filePath = null;
    this.dirty = false;
  }
}

export const sessionTimeline = new SessionTimeline();
