/**
 * Monitoring Session Service
 *
 * Manages work session monitoring, including:
 * - Session lifecycle (start/pause/resume/end)
 * - Periodic screenshot capture loop
 * - Focus change detection for extra captures
 * - Screenshot deduplication via SHA-256 hash
 * - Local frame storage with manifest tracking
 * - Checkpoint-based crash recovery
 * - Backend API synchronization
 *
 * Architecture v2: Uses LocalFrameStorage for persistent storage
 * and CheckpointService for crash recovery.
 *
 * @module monitoringSessionService
 */

import { BrowserWindow } from "electron";
import crypto from "crypto";
import { captureService } from "./captureService";
import { localFrameStorage, type FrameMetadata } from "./localFrameStorage";
import { checkpointService } from "./checkpointService";
import { authManager } from "./authManager";
import { IPC_CHANNELS } from "@mitable/shared";
import type {
  SelectedWindowInfo,
  MonitoringSessionState,
  MonitoringSessionStatus,
} from "@mitable/shared";

// ===========================
// Types & Interfaces
// ===========================

interface SessionConfig {
  sessionId: string; // Backend's session ID - passed from renderer
  selectedWindows: SelectedWindowInfo[];
  captureIntervalMs: number;
  name?: string;
  sessionGoal?: string; // Optional goal for on_task detection
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
  captureCount: number; // Track count from manifest
  lastCaptureHash?: string; // For deduplication
}

// ===========================
// MonitoringSessionService Class
// ===========================

class MonitoringSessionService {
  private activeSession: ActiveSession | null = null;
  private captureTimer: NodeJS.Timeout | null = null;

  constructor() {
    console.log("[MonitoringSessionService] Initialized with LocalFrameStorage + CheckpointService");
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

    const sessionId = config.sessionId;

    try {
      // Initialize local frame storage (persistent directory)
      const localPath = await localFrameStorage.initSession({
        sessionId,
        organizationId: config.organizationId,
        userId: config.userId,
        sessionGoal: config.sessionGoal,
        captureIntervalMs: config.captureIntervalMs,
        selectedWindows: config.selectedWindows.map((w) => ({
          windowId: w.windowId,
          appName: w.appName,
          windowTitle: w.windowTitle,
        })),
      });

      console.log(`[MonitoringSessionService] Session folder created: ${localPath}`);

      // Initialize active session
      const startedAt = Date.now();
      this.activeSession = {
        id: sessionId,
        config,
        status: "active",
        startedAt,
        totalPausedMs: 0,
        captureCount: 0,
      };

      // Start checkpoint tracking for crash recovery
      checkpointService.startSession({
        sessionId,
        organizationId: config.organizationId,
        userId: config.userId,
        sessionGoal: config.sessionGoal,
        status: "active",
        frameCount: 0,
        lastFrameId: "",
        lastFrameTimestamp: "",
        startedAt: new Date(startedAt).toISOString(),
        totalPausedMs: 0,
        localPath,
        manifestPath: `${localPath}/manifest.json`,
        selectedWindows: config.selectedWindows.map((w) => ({
          windowId: w.windowId,
          appName: w.appName,
          windowTitle: w.windowTitle,
        })),
        captureIntervalMs: config.captureIntervalMs,
      });

      // Start capture loop
      this.startCaptureLoop();

      // Broadcast session started
      this.broadcastSessionUpdate();

      console.log(`[MonitoringSessionService] Session started: ${sessionId}`, {
        windowCount: config.selectedWindows.length,
        intervalMs: config.captureIntervalMs,
      });

      return { sessionId };
    } catch (error) {
      console.error("[MonitoringSessionService] Failed to start session:", error);
      return {
        sessionId: "",
        error: `Failed to start session: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Pause the active session
   */
  async pauseSession(): Promise<{ success: boolean; error?: string }> {
    if (!this.activeSession) {
      return { success: false, error: "No active session" };
    }

    if (this.activeSession.status !== "active") {
      return {
        success: false,
        error: `Cannot pause session with status: ${this.activeSession.status}`,
      };
    }

    // Stop capture loop
    this.stopCaptureLoop();

    // Update session state
    this.activeSession.status = "paused";
    this.activeSession.pausedAt = Date.now();

    // Update local storage status
    await localFrameStorage.updateSessionStatus(this.activeSession.id, "paused");

    // Save checkpoint (important for crash recovery)
    await checkpointService.onSessionPaused();

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
      return {
        success: false,
        error: `Cannot resume session with status: ${this.activeSession.status}`,
      };
    }

    // Calculate pause duration and add to total
    if (this.activeSession.pausedAt) {
      const pauseDuration = Date.now() - this.activeSession.pausedAt;
      this.activeSession.totalPausedMs += pauseDuration;
    }

    // Update session state
    this.activeSession.status = "active";
    this.activeSession.pausedAt = undefined;

    // Update local storage status
    await localFrameStorage.updateSessionStatus(this.activeSession.id, "active", {
      totalPausedMs: this.activeSession.totalPausedMs,
    });

    // Update checkpoint
    await checkpointService.onSessionResumed(this.activeSession.totalPausedMs);

    // Restart capture loop
    this.startCaptureLoop();

    // Broadcast update
    this.broadcastSessionUpdate();

    console.log(`[MonitoringSessionService] Session resumed: ${this.activeSession.id}`);

    return { success: true };
  }

  /**
   * End the active session
   * Returns Top-K frames for upload to backend
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
      screenshotHash?: string;
      imageData?: string;
      // Analysis metadata
      deltaChanged?: boolean;
      deltaChangeType?: string;
      deltaChangeDescription?: string;
      deltaUserAction?: string;
      onTask?: boolean;
      taskRelevance?: string;
      importanceScore?: number;
      importanceReason?: string;
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

    const sessionId = this.activeSession.id;

    try {
      // Get manifest to access all frames
      const manifest = await localFrameStorage.loadManifest(sessionId);
      if (!manifest) {
        throw new Error("Session manifest not found");
      }

      // Select Top-K frames based on importance scores
      const topKFrameIds = this.selectTopKFrames(manifest.frames, 10);

      // End session in local storage with Top-K selection
      await localFrameStorage.endSession(sessionId, topKFrameIds);

      // Get Top-K frames for upload
      const topKFrames = await localFrameStorage.getTopKFrames(sessionId);

      // Convert to upload format with base64 data
      const captures = await Promise.all(
        topKFrames.map(async ({ metadata, imageBuffer }) => ({
          sequenceNumber: metadata.sequenceNumber,
          captureTrigger: metadata.trigger,
          capturedAt: new Date(metadata.timestamp).getTime(),
          windowId: metadata.windowSourceId,
          appName: metadata.appName,
          windowTitle: metadata.windowTitle,
          screenshotHash: metadata.hash,
          imageData: imageBuffer.toString("base64"),
          // Include analysis metadata
          deltaChanged: metadata.deltaChanged,
          deltaChangeType: metadata.deltaChangeType,
          deltaChangeDescription: metadata.deltaChangeDescription,
          deltaUserAction: metadata.deltaUserAction,
          onTask: metadata.onTask,
          taskRelevance: metadata.taskRelevance,
          importanceScore: metadata.importanceScore,
          importanceReason: metadata.importanceReason,
        }))
      );

      const captureCount = manifest.totalFrameCount;

      // End checkpoint tracking (removes checkpoint file)
      await checkpointService.endSession();

      // Update internal state
      this.activeSession.status = "ended";

      // Broadcast update
      this.broadcastSessionUpdate();

      console.log(`[MonitoringSessionService] Session ended: ${sessionId}`, {
        totalCaptureCount: captureCount,
        uploadCount: captures.length,
        duration: Date.now() - this.activeSession.startedAt - this.activeSession.totalPausedMs,
      });

      // Cleanup session state
      this.activeSession = null;

      // Schedule cleanup of local frames after 10 minutes (allows for re-summarization)
      setTimeout(
        () => {
          this.cleanupSessionFiles(sessionId);
        },
        10 * 60 * 1000
      );

      return { success: true, sessionId, captureCount, captures };
    } catch (error) {
      console.error("[MonitoringSessionService] Failed to end session:", error);
      return {
        success: false,
        error: `Failed to end session: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Reset/clear the active session (used when session is deleted externally)
   * This clears the in-memory state without triggering cleanup or backend sync
   */
  resetSession(): void {
    this.stopCaptureLoop();
    this.activeSession = null;
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
      elapsedMs -= now - this.activeSession.pausedAt;
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
      captureCount: this.activeSession.captureCount,
      elapsedMs,
    };
  }

  /**
   * Get captures for the current session from local storage
   */
  async getCaptures(): Promise<FrameMetadata[]> {
    if (!this.activeSession) return [];

    const manifest = await localFrameStorage.loadManifest(this.activeSession.id);
    return manifest?.frames || [];
  }

  /**
   * Recover session from checkpoint (crash recovery)
   */
  async recoverSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const checkpoint = await checkpointService.restoreFromCheckpoint(sessionId);
      if (!checkpoint) {
        return { success: false, error: "Checkpoint not found" };
      }

      // Load manifest from local storage
      const manifest = await localFrameStorage.loadManifest(sessionId);
      if (!manifest) {
        return { success: false, error: "Session manifest not found" };
      }

      // Restore active session state
      this.activeSession = {
        id: sessionId,
        config: {
          sessionId,
          selectedWindows: checkpoint.selectedWindows.map((w) => ({
            windowId: w.windowId,
            appName: w.appName,
            windowTitle: w.windowTitle,
          })),
          captureIntervalMs: checkpoint.captureIntervalMs,
          sessionGoal: checkpoint.sessionGoal,
          userId: checkpoint.userId,
          organizationId: checkpoint.organizationId,
        },
        status: checkpoint.status === "paused" ? "paused" : "active",
        startedAt: new Date(checkpoint.startedAt).getTime(),
        pausedAt: checkpoint.pausedAt ? new Date(checkpoint.pausedAt).getTime() : undefined,
        totalPausedMs: checkpoint.totalPausedMs,
        captureCount: checkpoint.frameCount,
      };

      // Resume capture loop if session was active
      if (checkpoint.status === "active") {
        this.startCaptureLoop();
      }

      // Broadcast update
      this.broadcastSessionUpdate();

      console.log(`[MonitoringSessionService] Session recovered: ${sessionId}`, {
        frameCount: checkpoint.frameCount,
        status: checkpoint.status,
      });

      return { success: true };
    } catch (error) {
      console.error("[MonitoringSessionService] Failed to recover session:", error);
      return {
        success: false,
        error: `Failed to recover session: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Discard a recoverable session
   */
  async discardRecoverableSession(sessionId: string): Promise<void> {
    await checkpointService.discardCheckpoint(sessionId);
    await localFrameStorage.deleteSession(sessionId);
    console.log(`[MonitoringSessionService] Discarded recoverable session: ${sessionId}`);
  }

  /**
   * Check for recoverable sessions on startup
   */
  async getRecoverableSessions(): Promise<
    Array<{
      sessionId: string;
      frameCount: number;
      lastCheckpoint: string;
      status: string;
    }>
  > {
    const checkpoints = await checkpointService.getIncompleteCheckpoints();
    return checkpoints.map((c) => ({
      sessionId: c.sessionId,
      frameCount: c.frameCount,
      lastCheckpoint: c.checkpointAt,
      status: c.status,
    }));
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
   * Process a single capture (deduplication, save to local storage, analyze)
   */
  private async processCapture(
    screenshot: { windowId: string; windowTitle: string; appName: string; dataUrl: string },
    trigger: "periodic" | "focus_change" | "manual"
  ): Promise<void> {
    if (!this.activeSession) {
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

    try {
      // Extract base64 data and convert to buffer
      const base64Data = screenshot.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");

      // Get previous frame for this window (for delta analysis)
      const previousFrame = await localFrameStorage.getPreviousFrameForWindow(
        this.activeSession.id,
        screenshot.windowId
      );

      // Save to local frame storage
      const frameMetadata = await localFrameStorage.saveFrame(this.activeSession.id, imageBuffer, {
        windowSourceId: screenshot.windowId,
        appName: screenshot.appName,
        windowTitle: screenshot.windowTitle,
        trigger,
      });

      // Update capture count
      this.activeSession.captureCount++;

      // Update checkpoint
      await checkpointService.onFrameCaptured(frameMetadata.frameId, frameMetadata.timestamp);

      console.log(`[MonitoringSessionService] Capture saved: ${frameMetadata.frameId}`, {
        sequenceNumber: frameMetadata.sequenceNumber,
        trigger,
        app: screenshot.appName,
      });

      // Trigger async frame analysis (don't block capture loop)
      this.analyzeFrameAsync(
        this.activeSession.id,
        frameMetadata.frameId,
        base64Data,
        previousFrame?.imageData || null,
        {
          windowSourceId: screenshot.windowId,
          appName: screenshot.appName,
          windowTitle: screenshot.windowTitle,
        }
      );
    } catch (error) {
      console.error("[MonitoringSessionService] Error saving capture:", error);
    }
  }

  /**
   * Analyze frame asynchronously (don't block capture loop)
   */
  private async analyzeFrameAsync(
    sessionId: string,
    frameId: string,
    currentImage: string,
    previousImage: string | null,
    windowInfo: { windowSourceId: string; appName: string; windowTitle: string }
  ): Promise<void> {
    // Don't attempt analysis if no auth token
    if (!authManager.getAccessToken()) {
      console.log("[MonitoringSessionService] Skipping analysis - no auth token");
      return;
    }

    try {
      const response = await authManager.authenticatedFetch(
        `/api/monitoring/sessions/${sessionId}/analyze-frame`,
        {
          method: "POST",
          body: JSON.stringify({
            frameId,
            currentImage,
            previousImage,
            windowInfo,
            sessionGoal: this.activeSession?.config.sessionGoal,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[MonitoringSessionService] Frame analysis failed: ${response.status}`, errorText);
        return;
      }

      const result = await response.json();

      if (result.success && result.analysis) {
        // Update frame metadata with analysis results
        await localFrameStorage.updateFrameAnalysis(sessionId, frameId, {
          deltaChanged: result.analysis.deltaChanged,
          deltaChangeType: result.analysis.deltaChangeType,
          deltaChangeDescription: result.analysis.deltaChangeDescription,
          deltaUserAction: result.analysis.deltaUserAction,
          onTask: result.analysis.onTask,
          taskRelevance: result.analysis.taskRelevance,
          importanceScore: result.analysis.importanceScore,
          importanceReason: result.analysis.importanceReason,
        });

        console.log(`[MonitoringSessionService] Frame analyzed: ${frameId}`, {
          deltaChangeType: result.analysis.deltaChangeType,
          importanceScore: result.analysis.importanceScore,
        });
      }
    } catch (error) {
      // Log but don't throw - analysis failure shouldn't stop session
      console.error("[MonitoringSessionService] Error analyzing frame:", error);
    }
  }

  /**
   * Select Top-K frames based on importance scores
   * Uses a combination of:
   * 1. Importance score from frame analysis
   * 2. Temporal diversity (avoid consecutive frames)
   * 3. Always include first and last frames for context
   */
  private selectTopKFrames(
    frames: Array<{
      frameId: string;
      timestamp: string;
      importanceScore?: number;
      sequenceNumber: number;
    }>,
    k: number = 10
  ): string[] {
    if (frames.length <= k) {
      // If we have fewer frames than K, return all
      return frames.map((f) => f.frameId);
    }

    const selectedIds: Set<string> = new Set();

    // Always include first and last frame for context
    const firstFrame = frames[0];
    const lastFrame = frames[frames.length - 1];
    selectedIds.add(firstFrame.frameId);
    selectedIds.add(lastFrame.frameId);

    // Sort remaining frames by importance score (descending)
    const remainingFrames = frames
      .filter((f) => f.frameId !== firstFrame.frameId && f.frameId !== lastFrame.frameId)
      .map((f) => ({
        ...f,
        // Default to 0.5 if no importance score (unanalyzed frames)
        score: f.importanceScore ?? 0.5,
      }))
      .sort((a, b) => b.score - a.score);

    // Group by time buckets (15-minute intervals) to ensure temporal diversity
    const BUCKET_SIZE_MS = 15 * 60 * 1000; // 15 minutes
    const buckets = new Map<number, typeof remainingFrames>();

    for (const frame of remainingFrames) {
      const timestamp = new Date(frame.timestamp).getTime();
      const bucketKey = Math.floor(timestamp / BUCKET_SIZE_MS);

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(frame);
    }

    // Select from buckets to ensure temporal diversity
    // Take max 2 frames per bucket, prioritize by importance score
    const maxPerBucket = 2;
    const sortedBucketKeys = [...buckets.keys()].sort((a, b) => a - b);

    for (const bucketKey of sortedBucketKeys) {
      if (selectedIds.size >= k) break;

      const bucketFrames = buckets.get(bucketKey)!;
      // Already sorted by score within the bucket (from earlier sort)
      let selectedFromBucket = 0;

      for (const frame of bucketFrames) {
        if (selectedIds.size >= k) break;
        if (selectedFromBucket >= maxPerBucket) break;

        selectedIds.add(frame.frameId);
        selectedFromBucket++;
      }
    }

    // If still under K, add remaining highest-scored frames
    for (const frame of remainingFrames) {
      if (selectedIds.size >= k) break;
      selectedIds.add(frame.frameId);
    }

    console.log(`[MonitoringSessionService] Selected ${selectedIds.size} top-K frames from ${frames.length} total`, {
      firstFrameId: firstFrame.frameId,
      lastFrameId: lastFrame.frameId,
      bucketCount: buckets.size,
    });

    return Array.from(selectedIds);
  }

  /**
   * Generate SHA-256 hash of screenshot data
   */
  private hashScreenshot(dataUrl: string): string {
    const data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
  }

  /**
   * Cleanup session files
   */
  private async cleanupSessionFiles(sessionId: string): Promise<void> {
    try {
      await localFrameStorage.deleteSession(sessionId);
      console.log(`[MonitoringSessionService] Cleaned up session: ${sessionId}`);
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

    const manifest = localFrameStorage.getCurrentManifest();
    const latestFrame = manifest?.frames[manifest.frames.length - 1];

    const progress = {
      sessionId: this.activeSession.id,
      captureCount: this.activeSession.captureCount,
      latestCapture: latestFrame
        ? {
            id: latestFrame.frameId,
            sequenceNumber: latestFrame.sequenceNumber,
            captureTrigger: latestFrame.trigger,
            capturedAt: new Date(latestFrame.timestamp).getTime(),
            windowId: latestFrame.windowSourceId,
            appName: latestFrame.appName,
            windowTitle: latestFrame.windowTitle,
          }
        : undefined,
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
