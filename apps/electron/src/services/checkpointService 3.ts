/**
 * Checkpoint Service
 * Handles periodic state persistence for crash recovery
 *
 * Checkpoints are saved:
 * - Every 50 frames captured
 * - Every 15 minutes of session time
 * - On session pause
 * - Before app quit (graceful shutdown)
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export interface SessionCheckpoint {
  sessionId: string;
  organizationId: string;
  userId: string;
  sessionGoal?: string;

  // State
  status: "active" | "paused";
  frameCount: number;
  lastFrameId: string;
  lastFrameTimestamp: string;

  // Timing
  startedAt: string;
  pausedAt?: string;
  totalPausedMs: number;
  checkpointAt: string;

  // Local storage
  localPath: string;
  manifestPath: string;

  // Selected windows
  selectedWindows: Array<{
    windowId: string;
    appName: string;
    windowTitle: string;
  }>;

  // Configuration
  captureIntervalMs: number;
}

export interface CheckpointStats {
  totalCheckpoints: number;
  incompleteSessionIds: string[];
  oldestCheckpoint: string | null;
  newestCheckpoint: string | null;
}

class CheckpointService {
  private readonly checkpointDir: string;
  private readonly checkpointInterval = 15 * 60 * 1000; // 15 minutes
  private readonly frameThreshold = 50; // Checkpoint every 50 frames

  private checkpointTimer: NodeJS.Timeout | null = null;
  private currentCheckpoint: SessionCheckpoint | null = null;
  private framesSinceCheckpoint = 0;
  private isShuttingDown = false;

  constructor() {
    const userDataPath = app.getPath("userData");
    this.checkpointDir = path.join(userDataPath, "session-checkpoints");
    this.ensureCheckpointDir();
    this.setupShutdownHandler();
  }

  /**
   * Ensure checkpoint directory exists
   */
  private ensureCheckpointDir(): void {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  /**
   * Setup graceful shutdown handler
   */
  private setupShutdownHandler(): void {
    const gracefulShutdown = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log("[Checkpoint] Graceful shutdown - saving final checkpoint");

      if (this.currentCheckpoint) {
        await this.saveCheckpoint();
      }

      this.stopAutoCheckpoint();
    };

    app.on("before-quit", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
  }

  /**
   * Get checkpoint file path for a session
   */
  private getCheckpointPath(sessionId: string): string {
    return path.join(this.checkpointDir, `${sessionId}.checkpoint.json`);
  }

  /**
   * Start a new session checkpoint
   */
  startSession(checkpoint: Omit<SessionCheckpoint, "checkpointAt">): void {
    this.currentCheckpoint = {
      ...checkpoint,
      checkpointAt: new Date().toISOString(),
    };
    this.framesSinceCheckpoint = 0;

    // Save initial checkpoint
    this.saveCheckpoint();

    // Start auto-checkpoint timer
    this.startAutoCheckpoint();

    console.log(`[Checkpoint] Session ${checkpoint.sessionId} started`);
  }

  /**
   * Update checkpoint state after frame capture
   */
  async onFrameCaptured(frameId: string, timestamp: string): Promise<void> {
    if (!this.currentCheckpoint) return;

    this.currentCheckpoint.frameCount++;
    this.currentCheckpoint.lastFrameId = frameId;
    this.currentCheckpoint.lastFrameTimestamp = timestamp;
    this.framesSinceCheckpoint++;

    // Checkpoint every N frames
    if (this.framesSinceCheckpoint >= this.frameThreshold) {
      await this.saveCheckpoint();
      this.framesSinceCheckpoint = 0;
    }
  }

  /**
   * Update checkpoint on session pause
   */
  async onSessionPaused(): Promise<void> {
    if (!this.currentCheckpoint) return;

    this.currentCheckpoint.status = "paused";
    this.currentCheckpoint.pausedAt = new Date().toISOString();

    await this.saveCheckpoint();
    this.stopAutoCheckpoint();

    console.log(`[Checkpoint] Session ${this.currentCheckpoint.sessionId} paused`);
  }

  /**
   * Update checkpoint on session resume
   */
  async onSessionResumed(totalPausedMs: number): Promise<void> {
    if (!this.currentCheckpoint) return;

    this.currentCheckpoint.status = "active";
    this.currentCheckpoint.pausedAt = undefined;
    this.currentCheckpoint.totalPausedMs = totalPausedMs;

    await this.saveCheckpoint();
    this.startAutoCheckpoint();

    console.log(`[Checkpoint] Session ${this.currentCheckpoint.sessionId} resumed`);
  }

  /**
   * End session and remove checkpoint
   */
  async endSession(): Promise<void> {
    if (!this.currentCheckpoint) return;

    const sessionId = this.currentCheckpoint.sessionId;
    const checkpointPath = this.getCheckpointPath(sessionId);

    // Remove checkpoint file (session completed successfully)
    try {
      if (fs.existsSync(checkpointPath)) {
        await fs.promises.unlink(checkpointPath);
      }
    } catch (error) {
      console.error(`[Checkpoint] Failed to remove checkpoint for ${sessionId}:`, error);
    }

    this.currentCheckpoint = null;
    this.framesSinceCheckpoint = 0;
    this.stopAutoCheckpoint();

    console.log(`[Checkpoint] Session ${sessionId} ended, checkpoint removed`);
  }

  /**
   * Save current checkpoint to disk
   */
  async saveCheckpoint(): Promise<void> {
    if (!this.currentCheckpoint) return;

    this.currentCheckpoint.checkpointAt = new Date().toISOString();

    const checkpointPath = this.getCheckpointPath(this.currentCheckpoint.sessionId);

    try {
      const data = JSON.stringify(this.currentCheckpoint, null, 2);
      await fs.promises.writeFile(checkpointPath, data, "utf-8");
      console.log(
        `[Checkpoint] Saved checkpoint for session ${this.currentCheckpoint.sessionId} ` +
          `(frame ${this.currentCheckpoint.frameCount})`
      );
    } catch (error) {
      console.error("[Checkpoint] Failed to save checkpoint:", error);
    }
  }

  /**
   * Load checkpoint for a session
   */
  async loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const checkpointPath = this.getCheckpointPath(sessionId);

    try {
      if (!fs.existsSync(checkpointPath)) {
        return null;
      }

      const data = await fs.promises.readFile(checkpointPath, "utf-8");
      return JSON.parse(data) as SessionCheckpoint;
    } catch (error) {
      console.error(`[Checkpoint] Failed to load checkpoint for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get all incomplete session checkpoints (for crash recovery)
   */
  async getIncompleteCheckpoints(): Promise<SessionCheckpoint[]> {
    const checkpoints: SessionCheckpoint[] = [];

    try {
      const files = await fs.promises.readdir(this.checkpointDir);

      for (const file of files) {
        if (file.endsWith(".checkpoint.json")) {
          const filePath = path.join(this.checkpointDir, file);
          try {
            const data = await fs.promises.readFile(filePath, "utf-8");
            const checkpoint = JSON.parse(data) as SessionCheckpoint;
            checkpoints.push(checkpoint);
          } catch (err) {
            console.warn(`[Checkpoint] Failed to read ${file}:`, err);
          }
        }
      }
    } catch (error) {
      console.error("[Checkpoint] Failed to read checkpoints directory:", error);
    }

    return checkpoints;
  }

  /**
   * Discard a checkpoint (user chose not to recover)
   */
  async discardCheckpoint(sessionId: string): Promise<void> {
    const checkpointPath = this.getCheckpointPath(sessionId);

    try {
      if (fs.existsSync(checkpointPath)) {
        await fs.promises.unlink(checkpointPath);
        console.log(`[Checkpoint] Discarded checkpoint for session ${sessionId}`);
      }
    } catch (error) {
      console.error(`[Checkpoint] Failed to discard checkpoint for ${sessionId}:`, error);
    }
  }

  /**
   * Restore from checkpoint (for crash recovery)
   */
  async restoreFromCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const checkpoint = await this.loadCheckpoint(sessionId);

    if (checkpoint) {
      this.currentCheckpoint = checkpoint;
      this.framesSinceCheckpoint = 0;
      this.startAutoCheckpoint();
      console.log(`[Checkpoint] Restored session ${sessionId} from checkpoint`);
    }

    return checkpoint;
  }

  /**
   * Start automatic periodic checkpointing
   */
  private startAutoCheckpoint(): void {
    if (this.checkpointTimer) {
      return;
    }

    this.checkpointTimer = setInterval(() => {
      this.saveCheckpoint();
    }, this.checkpointInterval);
  }

  /**
   * Stop automatic checkpointing
   */
  private stopAutoCheckpoint(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
  }

  /**
   * Get checkpoint statistics
   */
  async getStats(): Promise<CheckpointStats> {
    const checkpoints = await this.getIncompleteCheckpoints();

    const timestamps = checkpoints.map((c) => new Date(c.checkpointAt).getTime());

    return {
      totalCheckpoints: checkpoints.length,
      incompleteSessionIds: checkpoints.map((c) => c.sessionId),
      oldestCheckpoint:
        timestamps.length > 0
          ? new Date(Math.min(...timestamps)).toISOString()
          : null,
      newestCheckpoint:
        timestamps.length > 0
          ? new Date(Math.max(...timestamps)).toISOString()
          : null,
    };
  }

  /**
   * Check if there are any incomplete sessions to recover
   */
  async hasIncompleteSessionsToRecover(): Promise<boolean> {
    const checkpoints = await this.getIncompleteCheckpoints();
    return checkpoints.length > 0;
  }

  /**
   * Get current session ID if one is active
   */
  getCurrentSessionId(): string | null {
    return this.currentCheckpoint?.sessionId || null;
  }

  /**
   * Get current checkpoint state
   */
  getCurrentCheckpoint(): SessionCheckpoint | null {
    return this.currentCheckpoint;
  }
}

// Export singleton instance
export const checkpointService = new CheckpointService();
