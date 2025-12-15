/**
 * Monitoring Session Service
 *
 * Manages work session monitoring, including:
 * - Session lifecycle (start/pause/resume/end)
 * - Periodic screenshot capture loop
 * - Focus change detection for extra captures
 * - Screenshot deduplication via SHA-256 hash
 * - Temp file management with auto-cleanup
 * - Backend API synchronization
 *
 * @module monitoringSessionService
 */

import { BrowserWindow } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import { captureService } from "./captureService";
import { IPC_CHANNELS } from "@mitable/shared";
import type {
  SelectedWindowInfo,
  MonitoringSessionState,
  MonitoringSessionStatus,
} from "@mitable/shared";

// ===========================
// Types & Interfaces
// ===========================

interface CaptureMetadata {
  id: string;
  sequenceNumber: number;
  captureTrigger: "periodic" | "focus_change" | "manual";
  capturedAt: number;
  windowId?: string;
  appName?: string;
  windowTitle?: string;
  screenshotPath?: string;
  screenshotHash?: string;
  isDuplicate: boolean;
}

interface SessionConfig {
  sessionId: string; // Backend's session ID - passed from renderer
  selectedWindows: SelectedWindowInfo[];
  captureIntervalMs: number;
  name?: string;
  userId: string;
  organizationId: string;
}

interface ActiveSession {
  id: string; // Session ID (from backend - ensures Electron and backend use same ID)
  config: SessionConfig;
  status: MonitoringSessionStatus;
  startedAt: number;
  pausedAt?: number;
  totalPausedMs: number;
  captures: CaptureMetadata[];
  lastCaptureHash?: string; // For deduplication
}

// ===========================
// MonitoringSessionService Class
// ===========================

class MonitoringSessionService {
  private activeSession: ActiveSession | null = null;
  private captureTimer: NodeJS.Timeout | null = null;
  private sessionDir: string | null = null;

  constructor() {
    console.log("[MonitoringSessionService] Initialized");
  }

  /**
   * Start a new monitoring session
   * @param config - Session config including sessionId from backend
   */
  async startSession(config: SessionConfig): Promise<{ sessionId: string; error?: string }> {
    // Check for existing active session
    if (this.activeSession) {
      return {
        sessionId: "",
        error: "A session is already active. End it before starting a new one.",
      };
    }

    // Validate config
    if (!config.selectedWindows || config.selectedWindows.length === 0) {
      return {
        sessionId: "",
        error: "At least one window must be selected",
      };
    }

    if (!config.sessionId) {
      return {
        sessionId: "",
        error: "Session ID from backend is required",
      };
    }

    // Use the session ID provided by backend (ensures Electron and backend use same ID)
    const sessionId = config.sessionId;

    // Create session directory for screenshots
    this.sessionDir = join(tmpdir(), "mitable-sessions", sessionId);
    await fs.mkdir(this.sessionDir, { recursive: true });

    console.log(`[MonitoringSessionService] Created session directory: ${this.sessionDir}`);

    // Initialize session
    this.activeSession = {
      id: sessionId,
      config,
      status: "active",
      startedAt: Date.now(),
      totalPausedMs: 0,
      captures: [],
    };

    // Start capture loop
    this.startCaptureLoop();

    // Broadcast session started
    this.broadcastSessionUpdate();

    console.log(`[MonitoringSessionService] Session started: ${sessionId}`, {
      windowCount: config.selectedWindows.length,
      intervalMs: config.captureIntervalMs,
    });

    return { sessionId };
  }

  /**
   * Pause the active session
   */
  async pauseSession(): Promise<{ success: boolean; error?: string }> {
    if (!this.activeSession) {
      return { success: false, error: "No active session" };
    }

    if (this.activeSession.status !== "active") {
      return { success: false, error: `Cannot pause session with status: ${this.activeSession.status}` };
    }

    // Stop capture loop
    this.stopCaptureLoop();

    // Update session state
    this.activeSession.status = "paused";
    this.activeSession.pausedAt = Date.now();

    // Broadcast update
    this.broadcastSessionUpdate();

    console.log(`[MonitoringSessionService] Session paused: ${this.activeSession.id}`);

    return { success: true };
  }

  /**
   * Resume a paused session
   */
  async resumeSession(): Promise<{ success: boolean; error?: string }> {
    if (!this.activeSession) {
      return { success: false, error: "No active session" };
    }

    if (this.activeSession.status !== "paused") {
      return { success: false, error: `Cannot resume session with status: ${this.activeSession.status}` };
    }

    // Calculate pause duration and add to total
    if (this.activeSession.pausedAt) {
      const pauseDuration = Date.now() - this.activeSession.pausedAt;
      this.activeSession.totalPausedMs += pauseDuration;
    }

    // Update session state
    this.activeSession.status = "active";
    this.activeSession.pausedAt = undefined;

    // Restart capture loop
    this.startCaptureLoop();

    // Broadcast update
    this.broadcastSessionUpdate();

    console.log(`[MonitoringSessionService] Session resumed: ${this.activeSession.id}`);

    return { success: true };
  }

  /**
   * End the active session
   * Returns captures data so frontend can upload to backend before summarization
   */
  async endSession(): Promise<{
    success: boolean;
    sessionId?: string;
    captureCount?: number;
    captures?: Array<{
      sequenceNumber: number;
      captureTrigger: "periodic" | "focus_change" | "manual";
      capturedAt: number;
      windowId?: string;
      appName?: string;
      windowTitle?: string;
      screenshotPath?: string;
      screenshotHash?: string;
    }>;
    error?: string;
  }> {
    if (!this.activeSession) {
      return { success: false, error: "No active session" };
    }

    // Stop capture loop
    this.stopCaptureLoop();

    // Calculate final pause time if currently paused
    if (this.activeSession.status === "paused" && this.activeSession.pausedAt) {
      const pauseDuration = Date.now() - this.activeSession.pausedAt;
      this.activeSession.totalPausedMs += pauseDuration;
    }

    // Update session state
    const sessionId = this.activeSession.id;
    const captureCount = this.activeSession.captures.length;

    // Extract captures data to return to frontend (for backend upload)
    const captures = this.activeSession.captures.map((c) => ({
      sequenceNumber: c.sequenceNumber,
      captureTrigger: c.captureTrigger,
      capturedAt: c.capturedAt,
      windowId: c.windowId,
      appName: c.appName,
      windowTitle: c.windowTitle,
      screenshotPath: c.screenshotPath,
      screenshotHash: c.screenshotHash,
    }));

    this.activeSession.status = "ended";

    // Broadcast update
    this.broadcastSessionUpdate();

    console.log(`[MonitoringSessionService] Session ended: ${sessionId}`, {
      captureCount,
      duration: Date.now() - this.activeSession.startedAt - this.activeSession.totalPausedMs,
    });

    // Cleanup session state (data was already used above)
    this.activeSession = null;

    // Schedule cleanup of session directory after summary is generated (10 minutes)
    setTimeout(() => {
      this.cleanupSessionFiles(sessionId);
    }, 10 * 60 * 1000);

    return { success: true, sessionId, captureCount, captures };
  }

  /**
   * Reset/clear the active session (used when session is deleted externally)
   * This clears the in-memory state without triggering cleanup or backend sync
   */
  resetSession(): void {
    this.stopCaptureLoop();
    this.activeSession = null;
    this.sessionDir = null;
    this.broadcastSessionUpdate();
    console.log("[MonitoringSessionService] Session reset (external deletion)");
  }

  /**
   * Get current session state
   */
  getSessionState(): MonitoringSessionState | null {
    if (!this.activeSession) {
      return null;
    }

    const now = Date.now();
    let elapsedMs = now - this.activeSession.startedAt - this.activeSession.totalPausedMs;

    // If currently paused, subtract current pause duration
    if (this.activeSession.status === "paused" && this.activeSession.pausedAt) {
      elapsedMs -= (now - this.activeSession.pausedAt);
    }

    return {
      id: this.activeSession.id,
      status: this.activeSession.status,
      name: this.activeSession.config.name,
      selectedWindows: this.activeSession.config.selectedWindows,
      captureIntervalMs: this.activeSession.config.captureIntervalMs,
      startedAt: this.activeSession.startedAt,
      pausedAt: this.activeSession.pausedAt,
      totalPausedMs: this.activeSession.totalPausedMs,
      captureCount: this.activeSession.captures.length,
      elapsedMs,
    };
  }

  /**
   * Get captures for the current session
   */
  getCaptures(): CaptureMetadata[] {
    return this.activeSession?.captures || [];
  }

  // ===========================
  // Private Methods
  // ===========================

  /**
   * Start the periodic capture loop
   */
  private startCaptureLoop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
    }

    const intervalMs = this.activeSession?.config.captureIntervalMs || 30000;

    // Take initial capture immediately
    this.captureSelectedWindows("periodic");

    // Set up periodic capture
    this.captureTimer = setInterval(() => {
      if (this.activeSession?.status === "active") {
        this.captureSelectedWindows("periodic");
      }
    }, intervalMs);

    console.log(`[MonitoringSessionService] Capture loop started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop the capture loop
   */
  private stopCaptureLoop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    console.log("[MonitoringSessionService] Capture loop stopped");
  }

  /**
   * Capture screenshots of selected windows
   */
  private async captureSelectedWindows(
    trigger: "periodic" | "focus_change" | "manual"
  ): Promise<void> {
    if (!this.activeSession || this.activeSession.status !== "active") {
      return;
    }

    const selectedWindowIds = this.activeSession.config.selectedWindows.map((w) => w.windowId);

    try {
      // Use existing capture service
      const result = await captureService.captureVisibleWindows(false, selectedWindowIds);

      if (!result.success) {
        console.warn("[MonitoringSessionService] Capture failed:", result.error);
        return;
      }

      // Process each screenshot
      for (const screenshot of result.screenshots) {
        await this.processCapture(screenshot, trigger);
      }

      // Broadcast capture progress
      this.broadcastCaptureProgress();

    } catch (error) {
      console.error("[MonitoringSessionService] Error capturing windows:", error);
    }
  }

  /**
   * Process a single capture (deduplication, save to disk)
   */
  private async processCapture(
    screenshot: { windowId: string; windowTitle: string; appName: string; dataUrl: string },
    trigger: "periodic" | "focus_change" | "manual"
  ): Promise<void> {
    if (!this.activeSession || !this.sessionDir) {
      return;
    }

    // Generate hash for deduplication
    const hash = this.hashScreenshot(screenshot.dataUrl);

    // Check if duplicate
    const isDuplicate = hash === this.activeSession.lastCaptureHash;

    if (isDuplicate && trigger === "periodic") {
      console.log("[MonitoringSessionService] Skipping duplicate capture");
      return;
    }

    // Update last hash
    this.activeSession.lastCaptureHash = hash;

    // Generate capture ID and sequence number
    const captureId = crypto.randomUUID();
    const sequenceNumber = this.activeSession.captures.length + 1;

    // Save to disk
    const filename = `capture_${sequenceNumber.toString().padStart(4, "0")}_${trigger}.png`;
    const filePath = join(this.sessionDir, filename);

    try {
      // Extract base64 data and save
      const base64Data = screenshot.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      await fs.writeFile(filePath, Buffer.from(base64Data, "base64"));

      // Create capture metadata
      const capture: CaptureMetadata = {
        id: captureId,
        sequenceNumber,
        captureTrigger: trigger,
        capturedAt: Date.now(),
        windowId: screenshot.windowId,
        appName: screenshot.appName,
        windowTitle: screenshot.windowTitle,
        screenshotPath: filePath,
        screenshotHash: hash,
        isDuplicate,
      };

      this.activeSession.captures.push(capture);

      console.log(`[MonitoringSessionService] Capture saved: ${filename}`, {
        sequenceNumber,
        trigger,
        app: screenshot.appName,
      });

    } catch (error) {
      console.error("[MonitoringSessionService] Error saving capture:", error);
    }
  }

  /**
   * Generate SHA-256 hash of screenshot data
   */
  private hashScreenshot(dataUrl: string): string {
    // Use only the base64 data (skip the data URL prefix)
    const data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
  }

  /**
   * Cleanup session files
   */
  private async cleanupSessionFiles(sessionId: string): Promise<void> {
    const sessionDir = join(tmpdir(), "mitable-sessions", sessionId);

    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`[MonitoringSessionService] Cleaned up session directory: ${sessionDir}`);
    } catch (error) {
      console.error("[MonitoringSessionService] Error cleaning up session:", error);
    }
  }

  /**
   * Broadcast session state update to all windows
   */
  private broadcastSessionUpdate(): void {
    const state = this.getSessionState();

    // Send to all renderer windows
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.MONITORING_SESSION_UPDATE, state);
      }
    });
  }

  /**
   * Broadcast capture progress to all windows
   */
  private broadcastCaptureProgress(): void {
    if (!this.activeSession) return;

    const progress = {
      sessionId: this.activeSession.id,
      captureCount: this.activeSession.captures.length,
      latestCapture: this.activeSession.captures[this.activeSession.captures.length - 1],
    };

    // Send to all renderer windows
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.MONITORING_CAPTURE_PROGRESS, progress);
      }
    });
  }

  /**
   * Trigger a manual capture
   */
  async triggerManualCapture(): Promise<void> {
    if (this.activeSession?.status === "active") {
      await this.captureSelectedWindows("manual");
    }
  }
}

// Export singleton instance
export const monitoringSessionService = new MonitoringSessionService();
