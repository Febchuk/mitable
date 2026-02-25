/**
 * Passive Monitor Service
 *
 * Automatically starts monitoring sessions when sustained user activity
 * is detected (via Electron's powerMonitor.getSystemIdleTime()), and ends
 * them after prolonged inactivity.
 *
 * State machine:
 *   disabled ──enable()──> detecting ──sustained activity──> (session managed by monitoringSessionService)
 *       ^                     ^                                          │
 *       │                     │                     inactivity (5 min)   │
 *       │                     └──────────────────────────────────────────┘
 *       │                     ^
 *       │  disable()          │ onManualSessionEnd()
 *       │                     │
 *       └─── deferred <──onManualSessionStart()── detecting
 */

import { BrowserWindow, powerMonitor } from "electron";
import { createLogger } from "../lib/logger";

const logger = createLogger("PassiveMonitor");

export type PassiveMonitorState = "disabled" | "detecting" | "deferred";

// Detection thresholds
const POLL_INTERVAL_MS = 10_000; // Check idle time every 10 seconds
const IDLE_ACTIVE_THRESHOLD_S = 10; // User is "active" if idle < 10 seconds
const START_CONSECUTIVE_POLLS = 3; // 3 consecutive active polls (~30s sustained activity) → start
const STOP_IDLE_THRESHOLD_S = 300; // 5 minutes idle → end session

interface PassiveMonitorCallbacks {
  startSession: () => Promise<{ success: boolean; sessionId?: string }>;
  endSession: (sessionId: string) => Promise<void>;
  isAudioActive: () => boolean;
}

class PassiveMonitorService {
  private state: PassiveMonitorState = "disabled";
  private pollTimer: NodeJS.Timeout | null = null;
  private consecutiveActivePolls = 0;
  private activePassiveSessionId: string | null = null;
  private callbacks: PassiveMonitorCallbacks | null = null;

  getState(): { state: PassiveMonitorState; sessionId: string | null } {
    return {
      state: this.state,
      sessionId: this.activePassiveSessionId,
    };
  }

  /**
   * Enable passive monitoring — starts polling powerMonitor idle time.
   */
  enable(callbacks: PassiveMonitorCallbacks): void {
    if (this.state !== "disabled") {
      logger.warn("Already enabled, ignoring enable()");
      return;
    }

    logger.info("Enabling passive monitoring");
    this.callbacks = callbacks;
    this.consecutiveActivePolls = 0;
    this.state = "detecting";
    this.startPolling();
    this.broadcastState();
  }

  /**
   * Disable passive monitoring — stops polling, ends any active passive session.
   */
  async disable(): Promise<void> {
    logger.info("Disabling passive monitoring");
    this.stopPolling();

    if (this.activePassiveSessionId && this.callbacks) {
      await this.callbacks.endSession(this.activePassiveSessionId);
      this.activePassiveSessionId = null;
    }

    this.state = "disabled";
    this.callbacks = null;
    this.broadcastState();
  }

  /**
   * Reset internal state without calling the endSession callback.
   * Used during graceful shutdown when the session has already been ended
   * by the central endAllActiveSessions() handler.
   */
  forceReset(): void {
    logger.info("Force-resetting passive monitor state");
    this.stopPolling();
    this.activePassiveSessionId = null;
    this.consecutiveActivePolls = 0;
    this.state = "disabled";
    this.callbacks = null;
  }

  /**
   * Returns true if passive monitoring was in an enabled state
   * (detecting or had an active session). Used by the resume handler
   * to know whether to restart after suspend.
   */
  wasEnabled(): boolean {
    return this.state === "detecting" || this.activePassiveSessionId !== null;
  }

  /**
   * Called when a manual (focused) session starts.
   * If we're detecting or have an active passive session, defer.
   */
  async onManualSessionStart(): Promise<void> {
    if (this.state === "disabled") return;

    logger.info(`Manual session started, current state: ${this.state}`);

    // End any active passive session first (manual takes priority)
    if (this.activePassiveSessionId && this.callbacks) {
      await this.callbacks.endSession(this.activePassiveSessionId);
      this.activePassiveSessionId = null;
    }

    this.stopPolling();
    this.state = "deferred";
    this.broadcastState();
  }

  /**
   * Called when a manual (focused) session ends.
   * If we're deferred, resume detecting.
   */
  onManualSessionEnd(): void {
    if (this.state !== "deferred") return;

    logger.info("Manual session ended, resuming detection");
    this.consecutiveActivePolls = 0;
    this.state = "detecting";
    this.startPolling();
    this.broadcastState();
  }

  // ===========================
  // Private Methods
  // ===========================

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    const idleTime = powerMonitor.getSystemIdleTime(); // seconds

    if (this.state === "detecting") {
      if (idleTime < IDLE_ACTIVE_THRESHOLD_S) {
        this.consecutiveActivePolls++;
        logger.info(
          `Activity detected: idle ${idleTime}s (${this.consecutiveActivePolls}/${START_CONSECUTIVE_POLLS} polls)`
        );

        if (this.consecutiveActivePolls >= START_CONSECUTIVE_POLLS) {
          await this.startPassiveSession();
        }
      } else {
        this.consecutiveActivePolls = 0;
      }
    }

    // Check if an active passive session should end due to inactivity
    if (this.activePassiveSessionId) {
      if (idleTime >= STOP_IDLE_THRESHOLD_S) {
        // Don't end session if mic is active (user may be in a meeting)
        if (this.callbacks?.isAudioActive()) {
          logger.info(`Idle ${idleTime}s but mic is active — keeping session alive`);
        } else {
          logger.info(
            `Inactivity detected: idle ${idleTime}s >= ${STOP_IDLE_THRESHOLD_S}s threshold, ending passive session`
          );
          await this.endPassiveSession();
        }
      }
    }
  }

  private async startPassiveSession(): Promise<void> {
    if (!this.callbacks) {
      logger.error("Cannot start passive session: no callbacks");
      return;
    }

    logger.info("Starting passive session (sustained activity detected)");

    try {
      const result = await this.callbacks.startSession();

      if (result.success && result.sessionId) {
        this.activePassiveSessionId = result.sessionId;
        this.consecutiveActivePolls = 0;
        logger.info(`Passive session started: ${this.activePassiveSessionId}`);
      } else {
        logger.error("Passive session start failed");
        this.consecutiveActivePolls = 0;
      }
    } catch (error) {
      logger.error("Error starting passive session:", error);
      this.consecutiveActivePolls = 0;
    }

    this.broadcastState();
  }

  private async endPassiveSession(): Promise<void> {
    if (!this.activePassiveSessionId || !this.callbacks) return;

    const sessionId = this.activePassiveSessionId;
    logger.info(`Ending passive session: ${sessionId}`);

    try {
      await this.callbacks.endSession(sessionId);
    } catch (error) {
      logger.error("Error ending passive session:", error);
    }

    this.activePassiveSessionId = null;
    this.consecutiveActivePolls = 0;
    this.state = "detecting";
    this.broadcastState();
  }

  private broadcastState(): void {
    const stateData = this.getState();
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("passive-monitoring-state-update", stateData);
      }
    }
  }
}

export const passiveMonitorService = new PassiveMonitorService();
