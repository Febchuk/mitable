/**
 * Recovery Manager
 * Detects incomplete sessions on app startup and coordinates recovery
 *
 * Flow:
 * 1. On app ready, check for incomplete checkpoints
 * 2. If found, emit event to show recovery dialog
 * 3. User chooses to recover or discard each session
 * 4. Recovery: Resume session from checkpoint
 * 5. Discard: Delete checkpoint and local frames
 */

import { BrowserWindow, ipcMain } from "electron";
import * as fs from "fs";
import { IPC_CHANNELS } from "@mitable/shared";
import { createLogger } from "../lib/logger";

const logger = createLogger("RecoveryManager");
import { checkpointService, SessionCheckpoint } from "./checkpointService";

export interface RecoveryOption {
  sessionId: string;
  sessionGoal?: string;
  frameCount: number;
  lastFrameTimestamp: string;
  checkpointAt: string;
  duration: string; // Human-readable duration
  localPath: string;
}

export interface RecoveryResult {
  sessionId: string;
  action: "recover" | "discard";
  success: boolean;
  error?: string;
}

type RecoveryEventListener = (options: RecoveryOption[]) => void;

class RecoveryManager {
  private listeners: Set<RecoveryEventListener> = new Set();
  private pendingRecoveries: Map<string, SessionCheckpoint> = new Map();

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * Setup IPC handlers for recovery operations
   */
  private setupIpcHandlers(): void {
    // Get incomplete sessions for recovery dialog
    ipcMain.handle(IPC_CHANNELS.SESSION_GET_INCOMPLETE, async () => {
      return this.getRecoveryOptions();
    });

    // Recover a session
    ipcMain.handle(IPC_CHANNELS.SESSION_RECOVER, async (_event, sessionId: string) => {
      return this.recoverSession(sessionId);
    });

    // Discard a session
    ipcMain.handle(IPC_CHANNELS.SESSION_DISCARD, async (_event, sessionId: string) => {
      return this.discardSession(sessionId);
    });

    // Recover all sessions
    ipcMain.handle(IPC_CHANNELS.SESSION_RECOVER_ALL, async () => {
      return this.recoverAllSessions();
    });

    // Discard all sessions
    ipcMain.handle(IPC_CHANNELS.SESSION_DISCARD_ALL, async () => {
      return this.discardAllSessions();
    });
  }

  /**
   * Check for incomplete sessions on app startup
   * Returns true if there are sessions to recover
   */
  async checkForIncompleteSessions(): Promise<boolean> {
    const checkpoints = await checkpointService.getIncompleteCheckpoints();

    if (checkpoints.length === 0) {
      logger.info(" No incomplete sessions found");
      return false;
    }

    logger.info(` Found ${checkpoints.length} incomplete session(s)`);

    // Store for recovery
    this.pendingRecoveries.clear();
    for (const checkpoint of checkpoints) {
      this.pendingRecoveries.set(checkpoint.sessionId, checkpoint);
    }

    // Notify listeners
    const options = this.convertToRecoveryOptions(checkpoints);
    this.listeners.forEach((listener) => listener(options));

    return true;
  }

  /**
   * Get recovery options for UI
   */
  async getRecoveryOptions(): Promise<RecoveryOption[]> {
    const checkpoints = await checkpointService.getIncompleteCheckpoints();
    return this.convertToRecoveryOptions(checkpoints);
  }

  /**
   * Convert checkpoints to recovery options for UI
   */
  private convertToRecoveryOptions(checkpoints: SessionCheckpoint[]): RecoveryOption[] {
    return checkpoints.map((checkpoint) => {
      const startedAt = new Date(checkpoint.startedAt);
      const checkpointAt = new Date(checkpoint.checkpointAt);
      const durationMs = checkpointAt.getTime() - startedAt.getTime() - checkpoint.totalPausedMs;

      return {
        sessionId: checkpoint.sessionId,
        sessionGoal: checkpoint.sessionGoal,
        frameCount: checkpoint.frameCount,
        lastFrameTimestamp: checkpoint.lastFrameTimestamp,
        checkpointAt: checkpoint.checkpointAt,
        duration: this.formatDuration(durationMs),
        localPath: checkpoint.localPath,
      };
    });
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Recover a single session
   */
  async recoverSession(sessionId: string): Promise<RecoveryResult> {
    const checkpoint = this.pendingRecoveries.get(sessionId);

    if (!checkpoint) {
      return {
        sessionId,
        action: "recover",
        success: false,
        error: "Session checkpoint not found",
      };
    }

    try {
      // Restore from checkpoint
      await checkpointService.restoreFromCheckpoint(sessionId);

      // Mark as recovered in pending (will be removed when fully recovered)
      this.pendingRecoveries.delete(sessionId);

      logger.info(` Session ${sessionId} recovered successfully`);

      return {
        sessionId,
        action: "recover",
        success: true,
      };
    } catch (error) {
      logger.error(` Failed to recover session ${sessionId}:`, error);

      return {
        sessionId,
        action: "recover",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Discard a single session
   */
  async discardSession(sessionId: string): Promise<RecoveryResult> {
    const checkpoint = this.pendingRecoveries.get(sessionId);

    try {
      // Delete checkpoint
      await checkpointService.discardCheckpoint(sessionId);

      // Delete local frames folder if exists
      if (checkpoint?.localPath) {
        await this.deleteLocalFrames(checkpoint.localPath);
      }

      this.pendingRecoveries.delete(sessionId);

      logger.info(` Session ${sessionId} discarded`);

      return {
        sessionId,
        action: "discard",
        success: true,
      };
    } catch (error) {
      logger.error(` Failed to discard session ${sessionId}:`, error);

      return {
        sessionId,
        action: "discard",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Recover all pending sessions
   */
  async recoverAllSessions(): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];
    const sessionIds = Array.from(this.pendingRecoveries.keys());

    for (const sessionId of sessionIds) {
      const result = await this.recoverSession(sessionId);
      results.push(result);
    }

    return results;
  }

  /**
   * Discard all pending sessions
   */
  async discardAllSessions(): Promise<RecoveryResult[]> {
    const results: RecoveryResult[] = [];
    const sessionIds = Array.from(this.pendingRecoveries.keys());

    for (const sessionId of sessionIds) {
      const result = await this.discardSession(sessionId);
      results.push(result);
    }

    return results;
  }

  /**
   * Delete local frames folder
   */
  private async deleteLocalFrames(localPath: string): Promise<void> {
    try {
      if (fs.existsSync(localPath)) {
        await fs.promises.rm(localPath, { recursive: true, force: true });
        logger.info(` Deleted local frames at ${localPath}`);
      }
    } catch (error) {
      logger.warn(` Failed to delete local frames at ${localPath}:`, error);
    }
  }

  /**
   * Register listener for recovery events
   */
  onRecoveryNeeded(listener: RecoveryEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove listener
   */
  offRecoveryNeeded(listener: RecoveryEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Get pending recovery count
   */
  getPendingCount(): number {
    return this.pendingRecoveries.size;
  }

  /**
   * Check if a specific session is pending recovery
   */
  isPendingRecovery(sessionId: string): boolean {
    return this.pendingRecoveries.has(sessionId);
  }

  /**
   * Show recovery dialog in the console window
   */
  showRecoveryDialog(consoleWindow: BrowserWindow | null): void {
    if (!consoleWindow || this.pendingRecoveries.size === 0) {
      return;
    }

    // Send event to console window to show recovery dialog
    consoleWindow.webContents.send(IPC_CHANNELS.SESSION_SHOW_RECOVERY_DIALOG, {
      sessions: this.convertToRecoveryOptions(Array.from(this.pendingRecoveries.values())),
    });
  }
}

// Export singleton instance
export const recoveryManager = new RecoveryManager();
