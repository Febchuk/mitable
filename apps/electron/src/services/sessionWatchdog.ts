/**
 * Session Watchdog Service
 *
 * Monitors sessions stuck in "summarizing" state for extended periods
 * and marks them as "failed" if they exceed the watchdog timeout.
 * Also provides automatic reprocessing detection.
 *
 * This prevents sessions from being stuck indefinitely when the
 * AI pipeline crashes or hangs.
 */

import { createLogger } from "../lib/logger";

const logger = createLogger("SessionWatchdog");

// 30 minute watchdog timeout - sessions processing longer than this are considered stuck
const WATCHDOG_TIMEOUT_MS = 30 * 60 * 1000;

// Check interval - every 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

interface WatchdogEntry {
  sessionId: string;
  registeredAt: number;
  lastActivity: number;
}

class SessionWatchdog {
  private sessions = new Map<string, WatchdogEntry>();
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Register a session with the watchdog.
   * Called when pipeline processing starts.
   */
  register(sessionId: string): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      registeredAt: now,
      lastActivity: now,
    });
    logger.info(`Session ${sessionId} registered with watchdog`);

    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Unregister a session from the watchdog.
   * Called when pipeline completes (success or failure).
   */
  unregister(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      logger.info(`Session ${sessionId} unregistered from watchdog`);
    }

    if (this.sessions.size === 0 && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Update activity timestamp for a session.
   * Called periodically during long-running operations.
   */
  heartbeat(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastActivity = Date.now();
    }
  }

  /**
   * Start the watchdog check interval.
   */
  private start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.checkInterval = setInterval(() => this.checkSessions(), CHECK_INTERVAL_MS);
    logger.info("Session watchdog started");
  }

  /**
   * Stop the watchdog check interval.
   */
  private stop(): void {
    if (!this.isRunning) return;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info("Session watchdog stopped");
  }

  /**
   * Check all registered sessions for timeout.
   */
  private async checkSessions(): Promise<void> {
    const now = Date.now();
    const stuckSessions: string[] = [];

    for (const [sessionId, entry] of this.sessions) {
      const elapsed = now - entry.registeredAt;
      const sinceActivity = now - entry.lastActivity;

      // Mark as stuck if registered longer than timeout OR no activity for 15 minutes
      if (elapsed > WATCHDOG_TIMEOUT_MS || sinceActivity > 15 * 60 * 1000) {
        stuckSessions.push(sessionId);
        logger.error(
          `Session ${sessionId} appears stuck (registered ${(elapsed / 60000).toFixed(1)}min ago, last activity ${(sinceActivity / 60000).toFixed(1)}min ago)`
        );
      }
    }

    // Handle stuck sessions
    for (const sessionId of stuckSessions) {
      await this.handleStuckSession(sessionId);
    }
  }

  /**
   * Handle a stuck session by marking it as failed.
   */
  private async handleStuckSession(sessionId: string): Promise<void> {
    try {
      // Unregister first to prevent duplicate handling
      this.unregister(sessionId);

      // Import pgDb dynamically to avoid circular deps
      const { pgDb } = await import("./on-device");

      // Get current status
      const session = await pgDb.getMonitoringSession(sessionId);
      if (!session) {
        logger.warn(`Session ${sessionId} not found in DB, skipping watchdog handling`);
        return;
      }

      // Only intervene if still summarizing
      if (session.status === "summarizing") {
        logger.error(`Watchdog: Marking session ${sessionId} as failed due to timeout`);

        await pgDb.updateMonitoringSessionStatus(
          sessionId,
          "failed",
          Date.now(),
          "Session processing timed out - pipeline may have crashed or hung"
        );

        // Notify UI
        const { BrowserWindow } = await import("electron");
        const { IPC_CHANNELS } = await import("@mitable/shared");

        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.MONITORING_SESSION_UPDATE, null);
          }
        });

        logger.info(`Watchdog: Session ${sessionId} marked as failed and UI notified`);
      }
    } catch (err) {
      logger.error(`Watchdog: Failed to handle stuck session ${sessionId}:`, String(err));
    }
  }

  /**
   * Manually trigger a check (for testing/debugging).
   */
  async checkNow(): Promise<void> {
    await this.checkSessions();
  }

  /**
   * Get currently registered sessions (for debugging).
   */
  getRegisteredSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// Singleton export
export const sessionWatchdog = new SessionWatchdog();
