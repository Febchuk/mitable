/**
 * Focus Window Tracker
 *
 * Automatically tracks windows the user focuses on during a monitoring session.
 * Implements a 10-minute TTL (time-to-live) for each window:
 * - When a window is focused, it's added to the watch list
 * - Each focus resets the 10-minute timer
 * - Windows are removed after 10 minutes of not being focused
 * - Excludes: Mitable Electron renderers, policy-blocked windows, and Spotify
 *
 * @module focusWindowTracker
 */

import { BrowserWindow } from "electron";
import { createLogger } from "../lib/logger";
import { isBlockedByPolicy, getCapturePolicy } from "./capturePolicy";
import { windowDetectionService } from "./windowDetectionService";
import { IPC_CHANNELS } from "@mitable/shared";
import type { SelectedWindowInfo } from "@mitable/shared";

const logger = createLogger("FocusWindowTracker");

// TTL for watched windows (10 minutes in ms)
const WINDOW_TTL_MS = 10 * 60 * 1000;

// Polling interval for active window detection (2 seconds)
const POLL_INTERVAL_MS = 2000;

// Cleanup interval for expired windows (30 seconds)
const CLEANUP_INTERVAL_MS = 30 * 1000;

interface TrackedWindow {
  windowId: string;
  appName: string;
  windowTitle: string;
  displayName?: string;
  tabTitle?: string;
  isBrowser?: boolean;
  lastFocusedAt: number; // Timestamp of last focus
  expiresAt: number; // Timestamp when window should be removed
}

// Exact window titles of our own Electron renderers to exclude
const MITABLE_WINDOW_TITLES = new Set([
  "Mitable Agent",
  "Mitable Conversation",
  "Mitable Console",
  "Mitable Overlay",
  "Mitable Guide",
  "Mitable Nudge",
  "Watch Button",
]);

// RDP/Citrix app name patterns — these windows are invisible to get-windows
// and can't be re-added manually, so they must be exempt from TTL cleanup
const REMOTE_DESKTOP_PATTERNS = [
  "citrix",
  "hdx",
  "wfica",
  "remote desktop",
  "mstsc",
  "vmware horizon",
  "vmconnect",
];

function isRemoteDesktopApp(appName: string): boolean {
  const lower = appName.toLowerCase();
  return REMOTE_DESKTOP_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Normalize app name by removing OS-specific extensions
 * This ensures cross-platform matching works correctly
 */
function normalizeAppName(appName: string): string {
  if (!appName) return "";
  return appName
    .replace(/\.exe$/i, "") // Windows
    .replace(/\.app$/i, "") // macOS
    .replace(/\.AppImage$/i, ""); // Linux AppImage
}

/**
 * Check if a window should be excluded from tracking
 * Excludes: Mitable windows, Electron windows, Messages, WhatsApp, policy-blocked windows, and Spotify
 */
function shouldExcludeWindow(
  windowTitle: string,
  appName: string,
  policy: ReturnType<typeof getCapturePolicy>,
  userId?: string
): { excluded: boolean; reason?: string } {
  // Check 1: Mitable windows by title
  if (MITABLE_WINDOW_TITLES.has(windowTitle)) {
    return { excluded: true, reason: "Mitable window" };
  }

  // Check 2: Mitable windows by app name (normalized)
  const normalizedAppName = normalizeAppName(appName);
  if (normalizedAppName.toLowerCase() === "mitable") {
    return { excluded: true, reason: "Mitable app" };
  }

  // Check 3: Electron windows (dev app windows)
  if (normalizedAppName.toLowerCase() === "electron") {
    return { excluded: true, reason: "Electron window" };
  }

  // Check 4: Messages app (macOS Messages)
  if (normalizedAppName.toLowerCase() === "messages") {
    return { excluded: true, reason: "Messages app" };
  }

  // Check 5: WhatsApp
  if (normalizedAppName.toLowerCase() === "whatsapp") {
    return { excluded: true, reason: "WhatsApp app" };
  }

  // Check 6: Spotify by app name (normalized)
  if (normalizedAppName.toLowerCase() === "spotify") {
    return { excluded: true, reason: "Spotify app" };
  }

  // Check 7: Policy-blocked windows (pass userId if available)
  const policyDecision = isBlockedByPolicy(windowTitle, appName, policy, undefined, userId);
  if (policyDecision.blocked) {
    return { excluded: true, reason: policyDecision.reason || "Policy-blocked" };
  }

  return { excluded: false };
}

class FocusWindowTracker {
  private isTracking = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private trackedWindows: Map<string, TrackedWindow> = new Map();
  private lastActiveWindowId: string | null = null;
  private currentUserId: string | undefined = undefined;

  // Callback to notify when windows change
  private onWindowsChanged: ((windows: SelectedWindowInfo[]) => void) | null = null;

  constructor() {
    logger.info(" Initialized");
  }

  /**
   * Start tracking focused windows
   * Called when a monitoring session starts
   */
  async start(
    onWindowsChanged?: (windows: SelectedWindowInfo[]) => void,
    userId?: string
  ): Promise<void> {
    if (this.isTracking) {
      logger.warn(" Already tracking, ignoring start request");
      return;
    }

    this.isTracking = true;
    this.trackedWindows.clear();
    this.lastActiveWindowId = null;
    this.onWindowsChanged = onWindowsChanged || null;
    this.currentUserId = userId;

    // Immediately capture the current active window
    await this.checkActiveWindow();

    // Start polling for active window changes
    this.pollTimer = setInterval(() => {
      this.checkActiveWindow();
    }, POLL_INTERVAL_MS);

    // Start cleanup timer for expired windows
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredWindows();
    }, CLEANUP_INTERVAL_MS);

    logger.info(" Started tracking focused windows");
  }

  /**
   * Stop tracking focused windows
   * Called when a monitoring session ends
   */
  stop(): void {
    if (!this.isTracking) {
      return;
    }

    this.isTracking = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.trackedWindows.clear();
    this.lastActiveWindowId = null;
    this.onWindowsChanged = null;

    // Clear selected windows so checkForClosedWindows becomes a no-op
    windowDetectionService.clearAll();

    logger.info(" Stopped tracking focused windows");
  }

  /**
   * Get currently tracked windows as SelectedWindowInfo array
   */
  getTrackedWindows(): SelectedWindowInfo[] {
    return Array.from(this.trackedWindows.values()).map((tw) => ({
      windowId: tw.windowId,
      appName: tw.appName,
      windowTitle: tw.windowTitle,
      displayName: tw.displayName,
      tabTitle: tw.tabTitle,
      isBrowser: tw.isBrowser,
    }));
  }

  /**
   * Get tracked window IDs only
   */
  getTrackedWindowIds(): string[] {
    return Array.from(this.trackedWindows.keys());
  }

  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Check for active window and update tracking
   */
  private async checkActiveWindow(): Promise<void> {
    if (!this.isTracking) {
      return;
    }

    try {
      // Dynamic import for ESM-only package
      const activeWin = (await import("active-win")).default;
      const activeWindow = await activeWin();

      if (!activeWindow) {
        return;
      }

      const windowId = String(activeWindow.id);
      const appName = activeWindow.owner?.name ?? "";
      const windowTitle = activeWindow.title ?? "";

      // Skip if same window as last check
      if (windowId === this.lastActiveWindowId) {
        return;
      }

      this.lastActiveWindowId = windowId;

      // Skip windows with no title (except RDP/Citrix which may have empty titles)
      if (!windowTitle || windowTitle.trim() === "") {
        if (!isRemoteDesktopApp(appName)) {
          return;
        }
        // Use the app name as the title for RDP/Citrix windows
        logger.info(` Allowing empty-title RDP/Citrix window: ${appName}`);
      }

      // Check if window should be excluded (Mitable, Spotify, or policy-blocked)
      const policy = getCapturePolicy();
      const exclusionCheck = shouldExcludeWindow(windowTitle, appName, policy, this.currentUserId);

      if (exclusionCheck.excluded) {
        logger.info(
          ` Skipping excluded window: ${appName} - ${windowTitle} (${exclusionCheck.reason})`
        );
        return;
      }

      // Determine if it's a browser
      const browserApps = [
        "Google Chrome",
        "Safari",
        "Firefox",
        "Arc",
        "Microsoft Edge",
        "Brave Browser",
      ];
      const isBrowser = browserApps.includes(appName);

      // For RDP/Citrix with empty titles, use appName as fallback
      const effectiveTitle = windowTitle || appName;

      // Add or refresh the window
      this.addOrRefreshWindow({
        windowId,
        appName,
        windowTitle: effectiveTitle,
        displayName: appName,
        tabTitle: isBrowser ? windowTitle : undefined,
        isBrowser,
      });
    } catch (error) {
      // Log but don't throw - polling should continue
      logger.error(" Error checking active window:", error);
    }
  }

  /**
   * Add a new window or refresh its TTL
   */
  private addOrRefreshWindow(window: Omit<TrackedWindow, "lastFocusedAt" | "expiresAt">): void {
    const now = Date.now();
    const existingWindow = this.trackedWindows.get(window.windowId);

    if (existingWindow) {
      // Same OS window — just refresh TTL and title
      existingWindow.lastFocusedAt = now;
      existingWindow.expiresAt = now + WINDOW_TTL_MS;
      existingWindow.windowTitle = window.windowTitle;
      existingWindow.tabTitle = window.tabTitle;

      logger.info(
        ` Refreshed TTL for window: ${window.appName} (${window.windowTitle.substring(0, 40)}...)`
      );
    } else {
      // Different OS window — check if we already track another window for the same app
      // (e.g., Chrome main window vs DevTools, Windsurf editor vs terminal panel).
      // Replace the old entry so the badge count stays at one-per-app.
      for (const [existingId, existingWin] of this.trackedWindows) {
        if (existingWin.appName === window.appName) {
          this.trackedWindows.delete(existingId);
          windowDetectionService.removeWindow(existingId);
          logger.info(
            ` Replacing tracked window for ${window.appName}: ${existingId} → ${window.windowId}`
          );
          break;
        }
      }

      // Add new window
      const trackedWindow: TrackedWindow = {
        ...window,
        lastFocusedAt: now,
        expiresAt: now + WINDOW_TTL_MS,
      };
      this.trackedWindows.set(window.windowId, trackedWindow);

      logger.info(
        ` Added window to tracking: ${window.appName} (${window.windowTitle.substring(0, 40)}...)`
      );
    }

    // Sync with windowDetectionService for compatibility with existing capture logic
    windowDetectionService.addWindow({
      windowId: window.windowId,
      appName: window.appName,
      windowTitle: window.windowTitle,
      displayName: window.displayName,
      tabTitle: window.tabTitle,
      isBrowser: window.isBrowser,
    });

    // Notify listeners
    this.notifyWindowsChanged();
  }

  /**
   * Remove expired windows from tracking
   */
  private cleanupExpiredWindows(): void {
    const now = Date.now();
    const expiredWindowIds: string[] = [];

    for (const [windowId, window] of this.trackedWindows) {
      if (window.expiresAt <= now) {
        // Never auto-expire RDP/Citrix windows — they can't be re-added
        // because get-windows can't enumerate them
        if (isRemoteDesktopApp(window.appName)) {
          logger.info(
            ` Keeping RDP/Citrix window past TTL: ${window.appName} (${window.windowTitle.substring(0, 40)})`
          );
          continue;
        }
        expiredWindowIds.push(windowId);
      }
    }

    if (expiredWindowIds.length === 0) {
      return;
    }

    for (const windowId of expiredWindowIds) {
      const window = this.trackedWindows.get(windowId);
      if (window) {
        logger.info(
          ` Removed expired window: ${window.appName} (last focused ${Math.round((now - window.lastFocusedAt) / 1000 / 60)} min ago)`
        );
        this.trackedWindows.delete(windowId);
        windowDetectionService.removeWindow(windowId);
      }
    }

    // Notify listeners
    this.notifyWindowsChanged();
  }

  /**
   * Notify listeners that the tracked windows have changed
   */
  private notifyWindowsChanged(): void {
    const windows = this.getTrackedWindows();

    // Call the callback if set (updates session config)
    if (this.onWindowsChanged) {
      this.onWindowsChanged(windows);
    }

    // Broadcast windowDetectionService as the single source of truth for UI
    // (avoids divergence between focus tracker's internal map and the service)
    const uiWindows = windowDetectionService.getSelectedWindows();
    this.broadcastWindowsUpdate(uiWindows);
  }

  /**
   * Broadcast windows update to all BrowserWindows
   */
  private broadcastWindowsUpdate(windows: SelectedWindowInfo[]): void {
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, windows);
      }
    }
  }
}

// Export singleton instance
export const focusWindowTracker = new FocusWindowTracker();
