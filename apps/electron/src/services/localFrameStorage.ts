/**
 * Local Frame Storage Service
 * Manages local storage of session frames with manifest tracking
 *
 * Directory structure:
 * ~/Library/Application Support/Mitable/sessions/
 *   └── {sessionId}/
 *       ├── manifest.json     # Session metadata and frame index
 *       ├── frames/
 *       │   ├── 001_1234567890.png
 *       │   ├── 002_1234567891.png
 *       │   └── ...
 *       └── thumbnails/       # Optional small previews
 *           ├── 001_thumb.jpg
 *           └── ...
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createLogger } from "../lib/logger";
import type { IntervalEvidence } from "./activityTracker";

const logger = createLogger("LocalFrameStorage");

export interface FrameMetadata {
  frameId: string;
  sequenceNumber: number;
  filename: string;
  timestamp: string;
  windowSourceId: string;
  appName: string;
  windowTitle: string;
  trigger: "periodic" | "focus_change" | "manual";
  hash: string;

  // Activity evidence captured at frame time
  intervalEvidence?: IntervalEvidence;

  // Browser context (if applicable)
  browserContext?: { activeTabUrl: string; activeTabTitle: string; tabCount: number };

  // Analysis results (populated later)
  analysisStatus?: "pending" | "analyzed" | "skipped" | "duplicate";
  activityDescription?: string;
  confidence?: number;

  // Delta detection (populated after analysis)
  deltaChanged?: boolean;
  deltaChangeType?: string;
  deltaChangeDescription?: string;
  deltaUserAction?: string;

  // Task correlation
  onTask?: boolean;
  taskRelevance?: string;

  // Top-K selection scoring
  importanceScore?: number;
  importanceReason?: string;

  // Privacy
  isRedacted?: boolean;
}

export interface SessionManifest {
  sessionId: string;
  organizationId: string;
  userId: string;
  sessionGoal?: string;

  // Timing
  startedAt: string;
  endedAt?: string;
  totalPausedMs: number;

  // Configuration
  captureIntervalMs: number;
  selectedWindows: Array<{
    windowId: string;
    appName: string;
    windowTitle: string;
  }>;

  // Frame tracking
  frames: FrameMetadata[];
  totalFrameCount: number;
  lastFrameSequence: number;

  // Top-K selection (populated at session end)
  topKFrameIds?: string[];
  topKCount?: number;

  // Session state
  status: "active" | "paused" | "ended" | "summarizing" | "ready" | "delivered";

  // Metadata
  createdAt: string;
  updatedAt: string;
  manifestVersion: number;
}

class LocalFrameStorage {
  private readonly sessionsDir: string;
  private currentManifest: SessionManifest | null = null;
  private manifestWriteLock: Promise<void> = Promise.resolve();

  constructor() {
    const userDataPath = app.getPath("userData");
    this.sessionsDir = path.join(userDataPath, "sessions");
    this.ensureSessionsDir();
  }

  /**
   * Ensure sessions directory exists
   */
  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Get session directory path
   */
  getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  /**
   * Get frames directory path for a session
   */
  private getFramesPath(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), "frames");
  }

  /**
   * Get thumbnails directory path for a session
   */
  private getThumbnailsPath(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), "thumbnails");
  }

  /**
   * Get manifest file path for a session
   */
  private getManifestPath(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), "manifest.json");
  }

  /**
   * Initialize a new session folder
   */
  async initSession(config: {
    sessionId: string;
    organizationId: string;
    userId: string;
    sessionGoal?: string;
    captureIntervalMs: number;
    selectedWindows: Array<{
      windowId: string;
      appName: string;
      windowTitle: string;
    }>;
  }): Promise<string> {
    const sessionPath = this.getSessionPath(config.sessionId);
    const framesPath = this.getFramesPath(config.sessionId);
    const thumbnailsPath = this.getThumbnailsPath(config.sessionId);

    // Create directories
    await fs.promises.mkdir(sessionPath, { recursive: true });
    await fs.promises.mkdir(framesPath, { recursive: true });
    await fs.promises.mkdir(thumbnailsPath, { recursive: true });

    // Initialize manifest
    const now = new Date().toISOString();
    const manifest: SessionManifest = {
      sessionId: config.sessionId,
      organizationId: config.organizationId,
      userId: config.userId,
      sessionGoal: config.sessionGoal,
      startedAt: now,
      totalPausedMs: 0,
      captureIntervalMs: config.captureIntervalMs,
      selectedWindows: config.selectedWindows,
      frames: [],
      totalFrameCount: 0,
      lastFrameSequence: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
      manifestVersion: 1,
    };

    await this.saveManifest(config.sessionId, manifest);
    this.currentManifest = manifest;

    logger.info(` Initialized session folder: ${sessionPath}`);
    return sessionPath;
  }

  /**
   * Save a frame to the session folder
   */
  async saveFrame(
    sessionId: string,
    imageBuffer: Buffer,
    metadata: {
      windowSourceId: string;
      appName: string;
      windowTitle: string;
      trigger: "periodic" | "focus_change" | "manual";
    }
  ): Promise<FrameMetadata> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) {
      throw new Error(`Session manifest not found: ${sessionId}`);
    }

    // Generate frame metadata
    const sequenceNumber = manifest.lastFrameSequence + 1;
    const timestamp = new Date().toISOString();
    const frameId = `frame_${sequenceNumber.toString().padStart(4, "0")}_${Date.now()}`;
    const hash = crypto.createHash("sha256").update(imageBuffer).digest("hex");
    const filename = `${sequenceNumber.toString().padStart(4, "0")}_${Date.now()}.png`;

    // Save frame to disk
    const framePath = path.join(this.getFramesPath(sessionId), filename);
    await fs.promises.writeFile(framePath, imageBuffer);

    // Create frame metadata
    const frameMetadata: FrameMetadata = {
      frameId,
      sequenceNumber,
      filename,
      timestamp,
      windowSourceId: metadata.windowSourceId,
      appName: metadata.appName,
      windowTitle: metadata.windowTitle,
      trigger: metadata.trigger,
      hash,
      analysisStatus: "pending",
    };

    // Update manifest
    manifest.frames.push(frameMetadata);
    manifest.totalFrameCount++;
    manifest.lastFrameSequence = sequenceNumber;
    manifest.updatedAt = new Date().toISOString();

    await this.saveManifest(sessionId, manifest);
    this.currentManifest = manifest;

    logger.info(` Saved frame ${frameId} (${manifest.totalFrameCount} total)`);
    return frameMetadata;
  }

  /**
   * Read a frame image
   */
  async readFrame(sessionId: string, filename: string): Promise<Buffer | null> {
    const framePath = path.join(this.getFramesPath(sessionId), filename);

    try {
      return await fs.promises.readFile(framePath);
    } catch (error) {
      logger.error(` Failed to read frame ${filename}:`, error);
      return null;
    }
  }

  /**
   * Get frame as base64 data URL
   */
  async getFrameAsDataUrl(sessionId: string, filename: string): Promise<string | null> {
    const buffer = await this.readFrame(sessionId, filename);
    if (!buffer) return null;

    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  /**
   * Update frame metadata (after analysis)
   */
  async updateFrameMetadata(
    sessionId: string,
    frameId: string,
    updates: Partial<FrameMetadata>
  ): Promise<void> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) {
      throw new Error(`Session manifest not found: ${sessionId}`);
    }

    const frameIndex = manifest.frames.findIndex((f) => f.frameId === frameId);
    if (frameIndex === -1) {
      throw new Error(`Frame not found: ${frameId}`);
    }

    manifest.frames[frameIndex] = {
      ...manifest.frames[frameIndex],
      ...updates,
    };
    manifest.updatedAt = new Date().toISOString();

    await this.saveManifest(sessionId, manifest);
    this.currentManifest = manifest;
  }

  /**
   * Batch update multiple frames
   */
  async batchUpdateFrameMetadata(
    sessionId: string,
    updates: Array<{ frameId: string; updates: Partial<FrameMetadata> }>
  ): Promise<void> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) {
      throw new Error(`Session manifest not found: ${sessionId}`);
    }

    for (const { frameId, updates: frameUpdates } of updates) {
      const frameIndex = manifest.frames.findIndex((f) => f.frameId === frameId);
      if (frameIndex !== -1) {
        manifest.frames[frameIndex] = {
          ...manifest.frames[frameIndex],
          ...frameUpdates,
        };
      }
    }

    manifest.updatedAt = new Date().toISOString();
    await this.saveManifest(sessionId, manifest);
    this.currentManifest = manifest;
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: SessionManifest["status"],
    additionalUpdates?: Partial<SessionManifest>
  ): Promise<void> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) {
      throw new Error(`Session manifest not found: ${sessionId}`);
    }

    manifest.status = status;
    manifest.updatedAt = new Date().toISOString();

    if (additionalUpdates) {
      Object.assign(manifest, additionalUpdates);
    }

    await this.saveManifest(sessionId, manifest);
    this.currentManifest = manifest;
  }

  /**
   * End session and set Top-K frame IDs
   */
  async endSession(sessionId: string, topKFrameIds: string[]): Promise<void> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) {
      throw new Error(`Session manifest not found: ${sessionId}`);
    }

    manifest.status = "ended";
    manifest.endedAt = new Date().toISOString();
    manifest.topKFrameIds = topKFrameIds;
    manifest.topKCount = topKFrameIds.length;
    manifest.updatedAt = new Date().toISOString();

    await this.saveManifest(sessionId, manifest);
    this.currentManifest = manifest;

    logger.info(
      `[LocalStorage] Session ${sessionId} ended with ${topKFrameIds.length} top-K frames`
    );
  }

  /**
   * Get Top-K frames for upload
   */
  async getTopKFrames(sessionId: string): Promise<
    Array<{
      metadata: FrameMetadata;
      imageBuffer: Buffer;
    }>
  > {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest || !manifest.topKFrameIds) {
      return [];
    }

    const topKFrames: Array<{ metadata: FrameMetadata; imageBuffer: Buffer }> = [];

    for (const frameId of manifest.topKFrameIds) {
      const frame = manifest.frames.find((f) => f.frameId === frameId);
      if (frame) {
        const imageBuffer = await this.readFrame(sessionId, frame.filename);
        if (imageBuffer) {
          topKFrames.push({ metadata: frame, imageBuffer });
        }
      }
    }

    return topKFrames;
  }

  /**
   * Get previous frame for a specific window (for delta comparison)
   * Returns the most recent frame for the given window that has image data available
   */
  async getPreviousFrameForWindow(
    sessionId: string,
    windowSourceId: string
  ): Promise<{ metadata: FrameMetadata; imageData: string } | null> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest || manifest.frames.length === 0) return null;

    // Find frames for this window (sorted by sequence, most recent first)
    const windowFrames = manifest.frames
      .filter((f) => f.windowSourceId === windowSourceId)
      .sort((a, b) => b.sequenceNumber - a.sequenceNumber);

    // Skip the current frame (just added), get the previous one
    const previousFrame = windowFrames.length > 1 ? windowFrames[1] : null;
    if (!previousFrame) return null;

    // Read the image data
    const imageBuffer = await this.readFrame(sessionId, previousFrame.filename);
    if (!imageBuffer) return null;

    return {
      metadata: previousFrame,
      imageData: imageBuffer.toString("base64"),
    };
  }

  /**
   * Update frame with analysis results
   * Convenience method for updating delta detection and importance scoring
   */
  async updateFrameAnalysis(
    sessionId: string,
    frameId: string,
    analysis: {
      deltaChanged?: boolean;
      deltaChangeType?: string;
      deltaChangeDescription?: string;
      deltaUserAction?: string;
      onTask?: boolean;
      taskRelevance?: string;
      importanceScore?: number;
      importanceReason?: string;
      activityDescription?: string;
    }
  ): Promise<void> {
    await this.updateFrameMetadata(sessionId, frameId, {
      ...analysis,
      analysisStatus: "analyzed",
    });
  }

  /**
   * Get pending frames for analysis
   */
  async getPendingFrames(sessionId: string): Promise<FrameMetadata[]> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) return [];

    return manifest.frames.filter((f) => f.analysisStatus === "pending");
  }

  /**
   * Get frames by analysis status
   */
  async getFramesByStatus(
    sessionId: string,
    status: FrameMetadata["analysisStatus"]
  ): Promise<FrameMetadata[]> {
    const manifest = await this.loadManifest(sessionId);
    if (!manifest) return [];

    return manifest.frames.filter((f) => f.analysisStatus === status);
  }

  /**
   * Load manifest from disk
   */
  async loadManifest(sessionId: string): Promise<SessionManifest | null> {
    const manifestPath = this.getManifestPath(sessionId);

    try {
      if (!fs.existsSync(manifestPath)) {
        return null;
      }

      const data = await fs.promises.readFile(manifestPath, "utf-8");
      return JSON.parse(data) as SessionManifest;
    } catch (error) {
      logger.error(` Failed to load manifest for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save manifest to disk with write lock to prevent concurrent writes
   */
  private async saveManifest(sessionId: string, manifest: SessionManifest): Promise<void> {
    // Queue this write after any pending write completes (prevents race condition)
    const previousWrite = this.manifestWriteLock;
    let resolve: () => void;
    this.manifestWriteLock = new Promise<void>((r) => {
      resolve = r;
    });

    try {
      await previousWrite; // Wait for previous write to complete
      const manifestPath = this.getManifestPath(sessionId);
      const data = JSON.stringify(manifest, null, 2);
      await fs.promises.writeFile(manifestPath, data, "utf-8");
    } catch (error) {
      logger.error(` Failed to save manifest for ${sessionId}:`, error);
      throw error;
    } finally {
      resolve!(); // Release lock for next write
    }
  }

  /**
   * Get current manifest (cached)
   */
  getCurrentManifest(): SessionManifest | null {
    return this.currentManifest;
  }

  /**
   * Delete session folder and all contents
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);

    try {
      if (fs.existsSync(sessionPath)) {
        await fs.promises.rm(sessionPath, { recursive: true, force: true });
        logger.info(` Deleted session folder: ${sessionPath}`);
      }

      if (this.currentManifest?.sessionId === sessionId) {
        this.currentManifest = null;
      }
    } catch (error) {
      logger.error(` Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get all session IDs in local storage
   */
  async getAllSessionIds(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.sessionsDir, {
        withFileTypes: true,
      });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      logger.error(" Failed to list sessions:", error);
      return [];
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalSessions: number;
    totalFrames: number;
    totalSizeBytes: number;
  }> {
    const sessionIds = await this.getAllSessionIds();
    let totalFrames = 0;
    let totalSizeBytes = 0;

    for (const sessionId of sessionIds) {
      const manifest = await this.loadManifest(sessionId);
      if (manifest) {
        totalFrames += manifest.totalFrameCount;
      }

      // Calculate folder size
      const framesPath = this.getFramesPath(sessionId);
      try {
        const files = await fs.promises.readdir(framesPath);
        for (const file of files) {
          const stat = await fs.promises.stat(path.join(framesPath, file));
          totalSizeBytes += stat.size;
        }
      } catch {
        // Ignore errors
      }
    }

    return {
      totalSessions: sessionIds.length,
      totalFrames,
      totalSizeBytes,
    };
  }

  /**
   * Clean up old sessions (older than N days)
   */
  async cleanupOldSessions(daysToKeep: number = 7): Promise<number> {
    const sessionIds = await this.getAllSessionIds();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let deletedCount = 0;

    for (const sessionId of sessionIds) {
      const manifest = await this.loadManifest(sessionId);
      if (manifest) {
        const sessionDate = new Date(manifest.createdAt);
        if (sessionDate < cutoffDate && manifest.status === "delivered") {
          await this.deleteSession(sessionId);
          deletedCount++;
        }
      }
    }

    logger.info(` Cleaned up ${deletedCount} old sessions`);
    return deletedCount;
  }

  /**
   * Purge heavy assets (frames, thumbnails, audio) for sessions older than
   * hoursToKeep hours. Skips any session with status "active".
   * Keeps manifest.json and timeline.json for metadata/diagnostics.
   */
  async cleanupSessionAssets(hoursToKeep: number = 24): Promise<void> {
    const sessionIds = await this.getAllSessionIds();
    const cutoffMs = Date.now() - hoursToKeep * 60 * 60 * 1000;
    let cleaned = 0;

    for (const sessionId of sessionIds) {
      try {
        const manifest = await this.loadManifest(sessionId);
        if (!manifest) continue;
        if (manifest.status === "active") continue;

        const sessionDate = new Date(manifest.createdAt ?? manifest.startedAt);
        if (sessionDate.getTime() > cutoffMs) continue;

        const sessionPath = this.getSessionPath(sessionId);
        const toDelete = [
          path.join(sessionPath, "frames"),
          path.join(sessionPath, "thumbnails"),
          path.join(sessionPath, "audio_user.pcm"),
          path.join(sessionPath, "audio_remote.pcm"),
          path.join(sessionPath, "audio_user.wav"),
          path.join(sessionPath, "audio_remote.wav"),
        ];

        for (const target of toDelete) {
          try {
            if (fs.existsSync(target)) {
              const stat = fs.statSync(target);
              if (stat.isDirectory()) {
                await fs.promises.rm(target, { recursive: true, force: true });
              } else {
                await fs.promises.unlink(target);
              }
            }
          } catch {
            // Non-fatal — skip individual failures
          }
        }

        cleaned++;
      } catch {
        // Non-fatal — skip individual session failures
      }
    }

    if (cleaned > 0) {
      logger.info(`[Cleanup] Purged assets for ${cleaned} session(s) older than ${hoursToKeep}h`);
    }
  }
}

// Export singleton instance
export const localFrameStorage = new LocalFrameStorage();
