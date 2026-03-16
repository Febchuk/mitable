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
import { createLogger } from "../lib/logger";
import { captureService } from "./captureService";

const logger = createLogger("MonitoringSession");
import { localFrameStorage, type FrameMetadata } from "./localFrameStorage";
import { checkpointService } from "./checkpointService";
import { authManager } from "./authManager";
import { focusWindowTracker } from "./focusWindowTracker";
import { activityTracker, type IntervalEvidence } from "./activityTracker";
import { windowDetectionService } from "./windowDetectionService";
import { browserBridgeService } from "./browserBridgeService";
import { IPC_CHANNELS, SESSION_DEFAULTS } from "@mitable/shared";
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
  selectedWindows?: SelectedWindowInfo[]; // Optional - focus tracker will add windows dynamically
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
  lastCaptureHashByWindow: Map<string, string>; // Per-window deduplication
  consecutiveEmptyCaptures: number; // Track consecutive capture cycles with 0 captures
  lastSuccessfulCaptureAt: number; // Timestamp of last successful capture
}

// ===========================
// MonitoringSessionService Class
// ===========================

class MonitoringSessionService {
  private activeSession: ActiveSession | null = null;
  private captureTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    logger.info(
      "[MonitoringSessionService] Initialized with LocalFrameStorage + CheckpointService"
    );
  }

  /**
   * Start a new monitoring session
   * @param config - Session config including sessionId from backend
   *
   * Note: selectedWindows is now optional. If not provided, the focusWindowTracker
   * will automatically add windows as the user focuses on them during the session.
   */
  async startSession(config: SessionConfig): Promise<{ sessionId: string; error?: string }> {
    // Check for existing active session
    if (this.activeSession) {
      return {
        sessionId: "",
        error: "A session is already active. End it before starting a new one.",
      };
    }

    // Wait for auth token with timeout (handles IPC sync delay from Console renderer)
    // The Console window syncs tokens via IPC before calling this method,
    // but we add a wait here to handle any race conditions
    const maxWaitMs = 5000;
    const pollIntervalMs = 100;
    const startTime = Date.now();

    logger.info("[MonitoringSessionService] Waiting for auth token...", {
      hasTokenNow: !!authManager.getAccessToken(),
    });

    while (!authManager.getAccessToken() && Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const waitedMs = Date.now() - startTime;
    const hasToken = !!authManager.getAccessToken();

    logger.info("[MonitoringSessionService] Auth wait completed", {
      waitedMs,
      hasToken,
      timedOut: !hasToken && waitedMs >= maxWaitMs,
    });

    // Require authentication before starting session (prevents 401 errors on analyze-frame)
    if (!authManager.getAccessToken()) {
      return {
        sessionId: "",
        error: "Authentication required. Please log in before starting a monitoring session.",
      };
    }

    if (!config.sessionId) {
      return {
        sessionId: "",
        error: "Session ID from backend is required",
      };
    }

    const sessionId = config.sessionId;

    // Use provided windows or empty array (focus tracker will add windows dynamically)
    const initialWindows = config.selectedWindows || [];

    try {
      // Start focus window tracker to automatically add focused windows
      await focusWindowTracker.start((windows) => {
        // Update config's selectedWindows when focus tracker detects changes
        if (this.activeSession) {
          this.activeSession.config.selectedWindows = windows;
          // Broadcast update so UI can show current watched windows
          this.broadcastSessionUpdate();
        }
      }, config.userId);

      // Start activity tracker to collect keyboard/mouse/clipboard events
      activityTracker.start();

      // Initialize local frame storage (persistent directory)
      const localPath = await localFrameStorage.initSession({
        sessionId,
        organizationId: config.organizationId,
        userId: config.userId,
        sessionGoal: config.sessionGoal,
        captureIntervalMs: config.captureIntervalMs,
        selectedWindows: initialWindows.map((w) => ({
          windowId: w.windowId,
          appName: w.appName,
          windowTitle: w.windowTitle,
        })),
      });

      logger.info(` Session folder created: ${localPath}`);

      // Initialize active session
      const startedAt = Date.now();
      this.activeSession = {
        id: sessionId,
        config,
        status: "active",
        startedAt,
        totalPausedMs: 0,
        captureCount: 0,
        lastCaptureHashByWindow: new Map(),
        consecutiveEmptyCaptures: 0,
        lastSuccessfulCaptureAt: startedAt,
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
        selectedWindows: initialWindows.map((w) => ({
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

      logger.info(` Session started: ${sessionId}`, {
        initialWindowCount: initialWindows.length,
        intervalMs: config.captureIntervalMs,
        focusTrackingEnabled: true,
      });

      return { sessionId };
    } catch (error) {
      logger.error(" Failed to start session:", error);
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

    logger.info(` Session paused: ${this.activeSession.id}`);

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

    logger.info(` Session resumed: ${this.activeSession.id}`);

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

    // Stop focus window tracker
    focusWindowTracker.stop();

    // Stop activity tracker
    activityTracker.stop();

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

      logger.info(` Session ended: ${sessionId}`, {
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
      logger.error(" Failed to end session:", error);
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
    focusWindowTracker.stop();
    activityTracker.stop();
    this.activeSession = null;
    this.broadcastSessionUpdate();
  }

  /**
   * Get current session state for UI
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
      selectedWindows: this.activeSession.config.selectedWindows || [],
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
        lastCaptureHashByWindow: new Map(),
        consecutiveEmptyCaptures: 0,
        lastSuccessfulCaptureAt: Date.now(),
      };

      // Resume capture loop if session was active
      if (checkpoint.status === "active") {
        this.startCaptureLoop();
      }

      // Broadcast update
      this.broadcastSessionUpdate();

      logger.info(` Session recovered: ${sessionId}`, {
        frameCount: checkpoint.frameCount,
        status: checkpoint.status,
      });

      return { success: true };
    } catch (error) {
      logger.error(" Failed to recover session:", error);
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
    logger.info(` Discarded recoverable session: ${sessionId}`);
  }

  /**
   * Check for recoverable sessions on startup
   */
  async getRecoverableSessions(currentUserId?: string): Promise<
    Array<{
      sessionId: string;
      frameCount: number;
      lastCheckpoint: string;
      status: string;
    }>
  > {
    const checkpoints = await checkpointService.getIncompleteCheckpoints();
    const filtered = currentUserId
      ? checkpoints.filter((c) => c.userId === currentUserId)
      : checkpoints;
    return filtered.map((c) => ({
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

    const intervalMs =
      this.activeSession?.config.captureIntervalMs || SESSION_DEFAULTS.CAPTURE_INTERVAL_MS;

    // Take initial capture immediately
    this.captureSelectedWindows("periodic");

    // Set up periodic capture
    this.captureTimer = setInterval(() => {
      if (this.activeSession?.status === "active") {
        this.captureSelectedWindows("periodic");
      }
    }, intervalMs);

    // Set up periodic cleanup of closed windows (every 10 seconds)
    this.startWindowCleanupLoop();

    logger.info(` Capture loop started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop the capture loop
   */
  private stopCaptureLoop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    this.stopWindowCleanupLoop();
    logger.info(" Capture loop stopped");
  }

  /**
   * Start periodic cleanup of closed windows
   */
  private startWindowCleanupLoop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Check for closed windows every 10 seconds
    this.cleanupTimer = setInterval(async () => {
      if (this.activeSession?.status === "active") {
        const closedWindows = await windowDetectionService.checkForClosedWindows();
        if (closedWindows.length > 0) {
          logger.info(` Removed ${closedWindows.length} closed windows from watch list`);
          // Broadcast update so watch pill reflects accurate count
          this.broadcastSessionUpdate();
        }
      }
    }, 10000);
  }

  /**
   * Stop periodic window cleanup
   */
  private stopWindowCleanupLoop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Capture screenshots of selected windows
   * Gets windows dynamically from focusWindowTracker
   */
  private async captureSelectedWindows(
    trigger: "periodic" | "focus_change" | "manual"
  ): Promise<void> {
    if (!this.activeSession || this.activeSession.status !== "active") {
      return;
    }

    // Get windows from focus tracker (dynamic list based on user focus)
    const trackedWindowIds = focusWindowTracker.getTrackedWindowIds();

    // If no windows are being tracked yet, count as empty capture cycle
    if (trackedWindowIds.length === 0) {
      logger.info(" No windows tracked yet, skipping capture");
      this.activeSession.consecutiveEmptyCaptures++;
      this.checkCaptureHealth();
      return;
    }

    try {
      // Use existing capture service with dynamically tracked windows
      const result = await captureService.captureVisibleWindows(
        false,
        trackedWindowIds,
        this.activeSession.config.userId
      );

      if (!result.success) {
        logger.warn(" Capture failed:", result.error);
        this.activeSession.consecutiveEmptyCaptures++;
        this.checkCaptureHealth();
        return;
      }

      if (!result.screenshots || result.screenshots.length === 0) {
        // Fallback: when we have tracked windows but got 0 captures (e.g. full-screen
        // or other edge case), try screen capture as last resort.
        if (trackedWindowIds.length > 0) {
          const screenshot = await captureService.captureScreen();
          if (screenshot) {
            this.activeSession.consecutiveEmptyCaptures = 0;
            this.activeSession.lastSuccessfulCaptureAt = Date.now();
            await this.processCapture(screenshot, trigger);
            this.broadcastCaptureProgress();
            logger.info(
              "[CaptureService] Window capture returned 0 matches; used screen capture fallback."
            );
            return;
          }
        }
        this.activeSession.consecutiveEmptyCaptures++;
        this.checkCaptureHealth();
        return;
      }

      // Reset empty counter on successful capture
      this.activeSession.consecutiveEmptyCaptures = 0;
      this.activeSession.lastSuccessfulCaptureAt = Date.now();

      // Resolve accurate appName from focusWindowTracker (active-win)
      // windowTitle is preserved separately — this only fixes the appName field
      const trackedWindows = focusWindowTracker.getTrackedWindows();

      // Process each screenshot
      for (const screenshot of result.screenshots) {
        // Normalize desktopCapturer ID ("window:12345:0" → "12345") to match
        // OS-level IDs from active-win used by focusWindowTracker
        const normalizedId = screenshot.windowId.startsWith("window:")
          ? screenshot.windowId.split(":")[1]
          : screenshot.windowId;
        const trackedMatch = trackedWindows.find((w) => w.windowId === normalizedId);
        if (trackedMatch?.appName) {
          screenshot.appName = trackedMatch.appName;
        }
        await this.processCapture(screenshot, trigger);
      }

      // Broadcast capture progress
      this.broadcastCaptureProgress();
    } catch (error) {
      logger.error(" Error capturing windows:", error);
    }
  }

  /**
   * Check capture health — log warnings for debugging.
   * Session lifecycle is managed by PassiveMonitorService (auto-stop on 5min idle)
   * or manual stop by the user. We never auto-pause here.
   */
  private checkCaptureHealth(): void {
    if (!this.activeSession || this.activeSession.status !== "active") return;

    const emptyCount = this.activeSession.consecutiveEmptyCaptures;
    const lastCapture = this.activeSession.lastSuccessfulCaptureAt;
    const gapMinutes = Math.round((Date.now() - lastCapture) / 60000);

    // Log warnings for debugging but don't auto-pause.
    // Session lifecycle is managed by PassiveMonitorService (auto-stop on 5min idle)
    // or manual stop by the user.
    if (emptyCount > 0 && emptyCount % 10 === 0) {
      logger.warn(
        `[CaptureHealth] ${emptyCount} consecutive empty captures (~${gapMinutes}min without data)`
      );
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

    // Check if duplicate for THIS specific window (not global)
    const lastHashForWindow = this.activeSession.lastCaptureHashByWindow.get(screenshot.windowId);
    const isDuplicate = hash === lastHashForWindow;

    if (isDuplicate && trigger === "periodic") {
      logger.info(
        `[MonitoringSessionService] Skipping duplicate capture for window: ${screenshot.windowId}`
      );
      return;
    }

    // Update last hash for this window
    this.activeSession.lastCaptureHashByWindow.set(screenshot.windowId, hash);

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

      logger.info(` Capture saved: ${frameMetadata.frameId}`, {
        sequenceNumber: frameMetadata.sequenceNumber,
        trigger,
        app: screenshot.appName,
      });

      // Get and reset interval evidence (activity metadata since last capture)
      const intervalEvidence = activityTracker.reset();

      // Validate payload before analysis - backend requires frameId, currentImage, windowInfo
      // Empty base64 can occur when desktopCapturer returns empty/corrupt thumbnails
      // (e.g. Cursor, GPU-rendered apps, or certain full-screen states)
      if (!base64Data || base64Data.length < 100) {
        logger.warn(
          `[MonitoringSessionService] Skipping analysis for ${frameMetadata.frameId}: empty or invalid image data (window: ${screenshot.windowId}, app: ${screenshot.appName})`
        );
        return;
      }

      const windowInfo = {
        windowSourceId: screenshot.windowId,
        appName: screenshot.appName ?? "",
        windowTitle: screenshot.windowTitle ?? "",
      };
      if (!windowInfo.windowSourceId) {
        logger.warn(
          `[MonitoringSessionService] Skipping analysis for ${frameMetadata.frameId}: missing windowSourceId`
        );
        return;
      }

      // Enrich with browser context if active window is a browser
      let browserContext:
        | { activeTabUrl: string; activeTabTitle: string; tabCount: number }
        | undefined;
      const browserApps = ["chrome", "google chrome", "arc", "edge", "safari", "firefox", "brave"];
      if (
        browserApps.some((b) => (windowInfo.appName || "").toLowerCase().includes(b)) &&
        browserBridgeService.isConnected()
      ) {
        try {
          const tabsResponse = await Promise.race([
            browserBridgeService.sendCommand("get_tabs", {}),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
          ]);
          if (tabsResponse.success) {
            const tabs = (
              tabsResponse.payload as {
                tabs: Array<{ id: number; url: string; title: string; active: boolean }>;
              }
            ).tabs;
            const activeTab = tabs.find((t) => t.active);
            if (activeTab) {
              browserContext = {
                activeTabUrl: activeTab.url,
                activeTabTitle: activeTab.title,
                tabCount: tabs.length,
              };
            }
          }
        } catch {
          // Timeout or error — skip enrichment silently
        }
      }

      // Trigger async frame analysis (don't block capture loop)
      this.analyzeFrameAsync(
        this.activeSession.id,
        frameMetadata.frameId,
        base64Data,
        previousFrame?.imageData || null,
        windowInfo,
        {
          sequenceNumber: frameMetadata.sequenceNumber,
          captureTrigger: trigger,
          capturedAt: new Date(frameMetadata.timestamp).getTime(),
        },
        intervalEvidence,
        browserContext
      );
    } catch (error) {
      logger.error(" Error saving capture:", error);
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
    windowInfo: { windowSourceId: string; appName: string; windowTitle: string },
    captureMetadata?: {
      sequenceNumber: number;
      captureTrigger: "periodic" | "focus_change" | "manual";
      capturedAt: number;
    },
    intervalEvidence?: IntervalEvidence,
    browserContext?: { activeTabUrl: string; activeTabTitle: string; tabCount: number }
  ): Promise<void> {
    // Don't attempt analysis if no auth token
    if (!authManager.getAccessToken()) {
      logger.info(" Skipping analysis - no auth token");
      return;
    }

    try {
      // Add 60-second timeout to prevent ECONNABORTED errors
      // AI API calls (Gemini + Classifier) can be slow but should complete within 60s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await authManager.authenticatedFetch(
        `/api/monitoring/sessions/${sessionId}/analyze-frame`,
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            frameId,
            currentImage,
            previousImage,
            windowInfo,
            sessionGoal: this.activeSession?.config.sessionGoal,
            // Include capture metadata for database record creation/update
            ...(captureMetadata && {
              sequenceNumber: captureMetadata.sequenceNumber,
              captureTrigger: captureMetadata.captureTrigger,
              capturedAt: captureMetadata.capturedAt,
            }),
            // Include interval evidence (activity metadata)
            ...(intervalEvidence && { intervalEvidence }),
            // Include browser context when available
            ...(browserContext && { browserContext }),
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          `[MonitoringSessionService] Frame analysis failed: ${response.status}`,
          errorText
        );
        return;
      }

      const result = await response.json();

      if (result.success && result.analysis) {
        // Update frame metadata with analysis results
        await localFrameStorage.updateFrameAnalysis(sessionId, frameId, {
          deltaChanged: result.analysis.deltaChanged,
          deltaChangeType: result.analysis.changeType, // Backend uses 'changeType'
          deltaChangeDescription: result.analysis.changeDescription, // Backend uses 'changeDescription'
          deltaUserAction: result.analysis.userAction,
          onTask: result.analysis.onTask,
          taskRelevance: result.analysis.taskRelevance,
          importanceScore: result.analysis.importanceScore,
          importanceReason: result.analysis.importanceReason,
          // Include classified activity description if available
          activityDescription:
            result.analysis.activityDescription || result.analysis.summaryOfAction,
        });

        logger.info(` Frame analyzed: ${frameId}`, {
          changeType: result.analysis.changeType,
          activityDescription: result.analysis.activityDescription,
          importanceScore: result.analysis.importanceScore,
          captureId: result.analysis.captureId,
        });
      }
    } catch (error) {
      // Handle timeout separately
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn(
          ` Frame analysis timeout after 60s (frame will retry on next capture): ${frameId}`
        );
        return;
      }

      // Log but don't throw - analysis failure shouldn't stop session
      logger.error(" Error analyzing frame:", error);
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

    logger.info(
      `[MonitoringSessionService] Selected ${selectedIds.size} top-K frames from ${frames.length} total`,
      {
        firstFrameId: firstFrame.frameId,
        lastFrameId: lastFrame.frameId,
        bucketCount: buckets.size,
      }
    );

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
      logger.info(` Cleaned up session: ${sessionId}`);
    } catch (error) {
      logger.error(" Error cleaning up session:", error);
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
