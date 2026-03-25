/**
 * Focus Window Tracker
 *
 * Automatically tracks windows the user focuses on during a monitoring session.
 * Implements a 10-minute TTL (time-to-live) for each window:
 * - When a window is focused, it's added to the watch list
 * - Each focus resets the 10-minute timer
 * - Windows are removed after 10 minutes of not being focused
 * - The last-focused window is never removed by TTL (keeps watch list non-empty
 *   when user stays on one window, e.g. a call, without refocusing)
 * - Excludes: Mitable Electron renderers, policy-blocked windows, and Spotify
 *
 * @module focusWindowTracker
 */

import { BrowserWindow, desktopCapturer } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "../lib/logger";
import { isBlockedByPolicy, getCapturePolicy } from "./capturePolicy";
import { windowDetectionService } from "./windowDetectionService";
import { isSystemApp } from "../utils/browserTitleParser";
import { IPC_CHANNELS } from "@mitable/shared";
import type { SelectedWindowInfo } from "@mitable/shared";

const execFileAsync = promisify(execFile);

const logger = createLogger("FocusWindowTracker");

// TTL for watched windows (10 minutes in ms)
const WINDOW_TTL_MS = 10 * 60 * 1000;

// Polling interval for active window detection (2 seconds)
const POLL_INTERVAL_MS = 2000;

// Cleanup interval for expired windows (30 seconds)
const CLEANUP_INTERVAL_MS = 30 * 1000;

// Prefix for synthetic window IDs created by AppleScript fallback (full-screen apps)
const FULLSCREEN_WINDOW_ID_PREFIX = "fs-pid:";

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

// Apps that are always excluded from tracking.
// Checked with `includes` so helper/renderer processes also match
// (e.g. "WhatsApp Helper (Renderer)" still matches "whatsapp").
const ALWAYS_EXCLUDED_APPS: { pattern: string; reason: string }[] = [
  { pattern: "mitable", reason: "Mitable app" },
  { pattern: "electron", reason: "Electron window" },
  { pattern: "messages", reason: "Messages app" },
  { pattern: "whatsapp", reason: "WhatsApp app" },
  { pattern: "spotify", reason: "Spotify app" },
  { pattern: "imessage", reason: "iMessage app" },
];

/**
 * Check if a window should be excluded from tracking.
 * Uses `includes`-based matching so macOS helper/renderer processes
 * (e.g. "WhatsApp Helper", "Spotify Helper (Renderer)") are caught.
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

  // Check 2: Always-excluded apps by name (includes-based for helper processes)
  const lowerAppName = normalizeAppName(appName).toLowerCase();
  const lowerTitle = (windowTitle || "").toLowerCase();

  for (const { pattern, reason } of ALWAYS_EXCLUDED_APPS) {
    if (lowerAppName.includes(pattern) || lowerTitle === pattern) {
      return { excluded: true, reason };
    }
  }

  // Check 3: Policy-blocked windows + user block list
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

    // Fast initial polling burst (500ms for first 6s) to quickly detect
    // the user switching from Mitable Console to their work window
    const BURST_INTERVAL_MS = 500;
    const BURST_DURATION_MS = 6000;
    const burstStart = Date.now();

    this.pollTimer = setInterval(() => {
      this.checkActiveWindow();

      // After burst period, switch to normal polling interval
      if (Date.now() - burstStart > BURST_DURATION_MS && this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
          this.checkActiveWindow();
        }, POLL_INTERVAL_MS);
      }
    }, BURST_INTERVAL_MS);

    // Start cleanup timer for expired windows
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredWindows();
    }, CLEANUP_INTERVAL_MS);

    logger.info(" Started tracking focused windows (fast burst for 6s)");
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

      // active-win can return null for full-screen apps (own Space) and other edge cases.
      // Fallback chain: AppleScript (macOS) → desktopCapturer (cross-platform)
      if (!activeWindow) {
        const handled = await this.tryAddFrontmostFromAppleScript();
        if (!handled) {
          await this.tryAddFrontmostFromDesktopCapturer();
        }
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
        "Opera",
        "Opera GX",
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
      // active-win can throw (e.g. Command failed in full-screen Space)
      // Fallback chain: AppleScript (macOS) → desktopCapturer (cross-platform)
      logger.error(" Error checking active window:", error);
      const handled = await this.tryAddFrontmostFromAppleScript();
      if (!handled) {
        await this.tryAddFrontmostFromDesktopCapturer();
      }
    }
  }

  /**
   * macOS-only fallback: use AppleScript to detect the frontmost app when active-win
   * returns null (full-screen apps on their own Space). AppleScript's System Events
   * reliably reports the frontmost process even across Spaces.
   *
   * Returns true if a window was detected and tracked, false otherwise.
   */
  private async tryAddFrontmostFromAppleScript(): Promise<boolean> {
    if (process.platform !== "darwin") return false;

    try {
      const script = `
tell application "System Events"
  set fp to first application process whose frontmost is true
  set appName to name of fp
  set pid to unix id of fp
  try
    set winTitle to name of first window of fp
  on error
    set winTitle to ""
  end try
  return appName & "||" & pid & "||" & winTitle
end tell`;

      const { stdout } = await execFileAsync("osascript", ["-e", script], {
        timeout: 3000,
      });

      const parts = stdout.trim().split("||");
      if (parts.length < 2) return false;

      const appName = parts[0];
      const pid = parts[1];
      const windowTitle = parts.slice(2).join("||") || appName; // title may contain ||

      if (!appName || !pid) return false;

      // Check exclusions
      const policy = getCapturePolicy();
      const exclusionCheck = shouldExcludeWindow(windowTitle, appName, policy, this.currentUserId);
      if (exclusionCheck.excluded) {
        logger.info(
          ` AppleScript fallback: skipping excluded app ${appName} (${exclusionCheck.reason})`
        );
        return false;
      }

      // Check for existing tracked window for this PID/app to avoid duplicates
      const existingId = this.findTrackedWindowByPid(pid, appName);
      if (existingId) {
        // Refresh TTL on the existing entry
        const existing = this.trackedWindows.get(existingId)!;
        const now = Date.now();
        existing.lastFocusedAt = now;
        existing.expiresAt = now + WINDOW_TTL_MS;
        existing.windowTitle = windowTitle;
        this.lastActiveWindowId = existingId;
        return true;
      }

      const syntheticId = `${FULLSCREEN_WINDOW_ID_PREFIX}${pid}`;

      // Skip if same as last active window
      if (syntheticId === this.lastActiveWindowId) {
        return true;
      }

      const browserApps = [
        "Google Chrome",
        "Safari",
        "Firefox",
        "Arc",
        "Microsoft Edge",
        "Brave Browser",
        "Opera",
        "Opera GX",
      ];
      const isBrowser = browserApps.includes(appName);

      this.lastActiveWindowId = syntheticId;
      this.addOrRefreshWindow({
        windowId: syntheticId,
        appName,
        windowTitle,
        displayName: appName,
        tabTitle: isBrowser ? windowTitle : undefined,
        isBrowser,
      });

      logger.info(
        ` AppleScript fallback: added full-screen window ${appName} (pid=${pid}, title="${windowTitle.substring(0, 40)}")`
      );
      return true;
    } catch (error) {
      logger.warn(" AppleScript fallback failed:", error);
      return false;
    }
  }

  /**
   * Find an existing tracked window for a given PID to prevent duplicates when
   * a window transitions between windowed mode (OS window ID) and full-screen
   * mode (synthetic PID-based ID).
   *
   * Matches by:
   * 1. Existing synthetic ID for the same PID (fs-pid:NNN)
   * 2. Existing entry with the same appName (only one window of that app is
   *    visible in full-screen)
   */
  private findTrackedWindowByPid(pid: string, appName: string): string | null {
    const syntheticId = `${FULLSCREEN_WINDOW_ID_PREFIX}${pid}`;
    if (this.trackedWindows.has(syntheticId)) {
      return syntheticId;
    }

    // Look for an existing entry with the same appName
    for (const [windowId, window] of this.trackedWindows) {
      if (window.appName === appName) {
        return windowId;
      }
    }

    return null;
  }

  /**
   * Fallback when active-win returns null or throws (e.g. full-screen apps on their own Space).
   * Uses desktopCapturer directly — get-windows fails in the same scenarios, so we skip it
   * to avoid a slow failing call. Real apps (Chrome, Cursor, etc.) are prioritized over
   * system/Electron windows when multiple are returned.
   */
  private async tryAddFrontmostFromDesktopCapturer(): Promise<void> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        fetchWindowIcons: false,
      });

      if (!sources || sources.length === 0) return;

      const policy = getCapturePolicy();
      const browserApps = [
        "Google Chrome",
        "Safari",
        "Firefox",
        "Arc",
        "Microsoft Edge",
        "Brave Browser",
        "Opera",
        "Opera GX",
      ];

      // Parse sources into candidates with app name from title (desktopCapturer format: "Title - App")
      const candidates: Array<{
        windowId: string;
        appName: string;
        windowTitle: string;
        isSystemOrElectron: boolean;
      }> = [];

      for (const source of sources) {
        const windowTitle = source.name;
        if (!windowTitle || windowTitle.trim() === "") continue;

        if (MITABLE_WINDOW_TITLES.has(windowTitle)) continue;

        const titleParts = windowTitle.split(" - ");
        const appName = titleParts.length > 1 ? titleParts[titleParts.length - 1] : windowTitle;

        const exclusionCheck = shouldExcludeWindow(
          windowTitle,
          appName,
          policy,
          this.currentUserId
        );
        if (exclusionCheck.excluded) continue;

        const isSystemOrElectron =
          isSystemApp(appName) || normalizeAppName(appName).toLowerCase() === "electron";

        candidates.push({
          windowId: source.id,
          appName,
          windowTitle,
          isSystemOrElectron,
        });
      }

      if (candidates.length === 0) return;

      // Sort: real apps first, system/Electron last
      candidates.sort((a, b) => {
        if (a.isSystemOrElectron === b.isSystemOrElectron) return 0;
        return a.isSystemOrElectron ? 1 : -1;
      });

      const chosen = candidates[0];
      const isBrowser = browserApps.includes(chosen.appName);
      const effectiveTitle = chosen.windowTitle || chosen.appName;

      this.lastActiveWindowId = chosen.windowId;
      this.addOrRefreshWindow({
        windowId: chosen.windowId,
        appName: chosen.appName,
        windowTitle: effectiveTitle,
        displayName: chosen.appName,
        tabTitle: isBrowser ? chosen.windowTitle : undefined,
        isBrowser,
      });
      logger.info(
        ` Added window via desktopCapturer fallback: ${chosen.appName} (${effectiveTitle.substring(0, 40)}...)`
      );
    } catch (error) {
      logger.error(" desktopCapturer fallback failed:", error);
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
      // Different OS window
      // We no longer replace the old entry. This allows tracking multiple windows of the same app
      // (e.g. multiple Chrome windows, or VS Code window + terminal).

      /* 
      // LEGACY: Replaced old entry so badge count stayed at one-per-app.
      // Removed to support multi-window tracking per app.
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
      */

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
   * Remove tracked windows that are now on the user's block list.
   * Called from the periodic cleanup loop and immediately when block list changes.
   */
  removeBlockedWindows(): void {
    if (!this.isTracking) return;

    const policy = getCapturePolicy();
    const removedIds: string[] = [];

    for (const [windowId, window] of this.trackedWindows) {
      const exclusion = shouldExcludeWindow(
        window.windowTitle,
        window.appName,
        policy,
        this.currentUserId
      );
      if (exclusion.excluded) {
        removedIds.push(windowId);
        logger.info(` Evicting newly-blocked window: ${window.appName} (${exclusion.reason})`);
      }
    }

    if (removedIds.length === 0) return;

    for (const id of removedIds) {
      this.trackedWindows.delete(id);
      windowDetectionService.removeWindow(id);
    }

    this.notifyWindowsChanged();
  }

  /**
   * Remove expired windows from tracking
   *
   * The last-focused window is never removed by TTL, even if expired. This prevents
   * the watch list from going empty when the user stays on one window (e.g., a call)
   * for 10+ minutes without refocusing — they would otherwise have to manually
   * re-add it or switch away and back.
   */
  private cleanupExpiredWindows(): void {
    // Also re-check block list so mid-session changes take effect
    this.removeBlockedWindows();

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
        // Never remove the last-focused window — keeps watch list non-empty when
        // user stays on one window (e.g., call) without refocusing
        if (windowId === this.lastActiveWindowId) {
          logger.info(
            ` Keeping last-focused window past TTL: ${window.appName} (${window.windowTitle.substring(0, 40)})`
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
