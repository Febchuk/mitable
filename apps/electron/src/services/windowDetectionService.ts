/**
 * Window Detection Service
 *
 * Manages detection of visible windows and tracks which apps the user has selected
 * to watch for screenshot capture. Integrates with capture policy to identify
 * blocked applications.
 *
 * Features:
 * - Detect all visible windows using get-windows package
 * - Filter against capture policy (mark blocked apps)
 * - Track user-selected apps for watching
 * - Exclude Mitable's own windows from detection
 *
 * @module windowDetectionService
 */

import type { SelectedWindowInfo, WatchableWindow, WatchState } from "@mitable/shared";
import { isBlockedByPolicy, getCapturePolicy } from "./capturePolicy";
import { isBrowserApp, parseBrowserTitle, isSystemApp } from "../utils/browserTitleParser";
import { createLogger } from "../lib/logger";

const logger = createLogger("WindowDetection");
// Dynamic import for get-windows (ESM-only package) - see getAllVisibleWindows()

// Type declaration for get-windows package
interface GetWindowsResult {
  title: string;
  id: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  owner: {
    name: string;
    processId: number;
    bundleId?: string;
    path?: string;
  };
  memoryUsage?: number;
}

// Extended window info with tracking metadata
interface TrackedWindowInfo extends SelectedWindowInfo {
  lastSeenAt: number; // Timestamp when window was last detected by get-windows or active-win
}

class WindowDetectionService {
  // Track which windows user has selected to watch
  private selectedWindows: Map<string, TrackedWindowInfo> = new Map();
  // Note: isWatching is derived from selectedWindows.size > 0 (no separate flag)

  // Last detected OS windows keyed by windowId (stringified)
  private lastDetectedWindows: Map<string, GetWindowsResult> = new Map();

  // Track if we've logged the permission warning to avoid spam
  private permissionWarningLogged = false;

  // Track apps that have been detected (for block list management)
  // Key: normalized app name (lowercase), Value: original app name
  private detectedApps: Map<string, string> = new Map();

  // Exact window titles of our own Electron renderers to exclude
  private readonly MITABLE_WINDOW_TITLES: Set<string> = new Set([
    "Mitable Agent",
    "Mitable Conversation",
    "Mitable Console",
    "Mitable Overlay",
    "Mitable Guide",
    "Mitable Nudge",
    "Watch Button", // watch-mode button windows
  ]);

  constructor() {
    logger.info(" Initialized");
  }

  /**
   * Get all visible windows, excluding Mitable's own windows
   * Marks windows as blocked based on capture policy
   *
   * @returns Array of watchable windows with policy status
   */
  async getAllVisibleWindows(): Promise<WatchableWindow[]> {
    try {
      // Dynamic import for ESM-only package (required for CJS main process)
      const { openWindows } = await import("get-windows");
      // Get all windows using get-windows library
      const allWindows = await openWindows();

      logger.info(` Detected ${allWindows.length} total windows`);

      const policy = getCapturePolicy();
      const watchableWindows: WatchableWindow[] = [];

      for (const window of allWindows) {
        const windowId = window.id.toString();

        // Track last seen metadata for later lookups (e.g., watch selection)
        this.lastDetectedWindows.set(windowId, window);

        const appName = window.owner.name;
        const windowTitle = window.title;

        // Log ALL windows for debugging (especially Citrix/RDP)
        logger.info(
          `[WindowDetectionService] Window: ID=${windowId}, App="${appName}", Title="${windowTitle}"`
        );

        // Skip Mitable's own windows
        if (this.isMitableWindow(window.title)) {
          logger.info(` Skipping Mitable window: ${window.title}`);
          continue;
        }

        // Check if it's a remote desktop app (Citrix, RDP, etc.)
        const isRemoteDesktopApp =
          appName.toLowerCase().includes("citrix") ||
          appName.toLowerCase().includes("hdx") ||
          appName.toLowerCase().includes("wfica") ||
          appName.toLowerCase().includes("remote desktop") ||
          appName.toLowerCase().includes("mstsc") ||
          windowTitle.toLowerCase().includes("remote desktop");

        // Skip windows with no title UNLESS it's a remote desktop app
        if ((!windowTitle || windowTitle.trim() === "") && !isRemoteDesktopApp) {
          logger.info(`[WindowDetectionService] Skipping window with empty title: ${appName}`);
          continue;
        }

        // Skip system apps (Finder, Notification Center, etc.)
        if (isSystemApp(appName)) {
          logger.info(` Skipping system app: ${appName}`);
          continue;
        }

        // Track detected apps for block list management
        const normalizedAppName = this.normalizeAppName(appName).toLowerCase();
        if (normalizedAppName && !this.detectedApps.has(normalizedAppName)) {
          this.detectedApps.set(normalizedAppName, appName);
        }

        // Check capture policy
        const policyDecision = isBlockedByPolicy(windowTitle, appName, policy);

        // Parse browser title for better display
        const isBrowser = isBrowserApp(appName);
        const parsed = parseBrowserTitle(windowTitle, appName);

        const watchableWindow: WatchableWindow = {
          windowId,
          appName,
          windowTitle,
          displayName: parsed.browserDisplayName, // Short app name (e.g., "Chrome")
          tabTitle: isBrowser ? parsed.tabTitle : undefined, // Tab title for browsers only
          isBrowser,
          bounds: window.bounds,
          isBlocked: policyDecision.blocked,
          blockReason: policyDecision.reason,
        };

        watchableWindows.push(watchableWindow);

        logger.info(` Window detected:`, {
          app: appName,
          title: windowTitle.substring(0, 50) + (windowTitle.length > 50 ? "..." : ""),
          blocked: policyDecision.blocked,
          reason: policyDecision.reason,
        });
      }

      logger.info(
        `[WindowDetectionService] Returning ${watchableWindows.length} watchable windows`
      );
      return watchableWindows;
    } catch (error) {
      logger.error(" Failed to get windows:", error);
      logger.error(" Error details:", {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack,
      });
      throw error; // Re-throw so caller can report the actual error
    }
  }

  /**
   * Check if a window title belongs to Mitable
   */
  private isMitableWindow(title: string): boolean {
    // Only exclude exact-known titles from our app to avoid false positives
    return this.MITABLE_WINDOW_TITLES.has(title);
  }

  /**
   * Normalize app name by removing OS-specific extensions
   */
  private normalizeAppName(appName: string): string {
    if (!appName) return "";
    return appName
      .replace(/\.exe$/i, "") // Windows
      .replace(/\.app$/i, "") // macOS
      .replace(/\.AppImage$/i, ""); // Linux AppImage
  }

  /**
   * Check if a window should be excluded from being added to the watch list
   * Excludes: Mitable windows, Electron windows, Messages, WhatsApp, policy-blocked windows, and Spotify
   */
  private shouldExcludeWindow(
    windowTitle: string,
    appName: string
  ): { excluded: boolean; reason?: string } {
    // Check 1: Mitable windows by title
    if (this.isMitableWindow(windowTitle)) {
      return { excluded: true, reason: "Mitable window" };
    }

    // Check 2: Mitable windows by app name (normalized)
    const normalizedAppName = this.normalizeAppName(appName);
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

    // Check 7: Policy-blocked windows
    const policy = getCapturePolicy();
    const policyDecision = isBlockedByPolicy(windowTitle, appName, policy);
    if (policyDecision.blocked) {
      return { excluded: true, reason: policyDecision.reason || "Policy-blocked" };
    }

    return { excluded: false };
  }

  /**
   * Add a window to the watch list
   *
   * @param window - Window metadata to track
   * @returns true if added, false if already watching or excluded
   */
  addWindow(window: SelectedWindowInfo): boolean {
    if (this.selectedWindows.has(window.windowId)) {
      // Window already exists, just update lastSeenAt
      const existing = this.selectedWindows.get(window.windowId);
      if (existing) {
        existing.lastSeenAt = Date.now();
      }
      return false;
    }

    // Check if window should be excluded (Mitable, Spotify, or policy-blocked)
    const exclusionCheck = this.shouldExcludeWindow(window.windowTitle, window.appName);
    if (exclusionCheck.excluded) {
      logger.info(
        `[WindowDetectionService] Rejected excluded window: ${window.appName} (${window.windowTitle}) [${window.windowId}] - ${exclusionCheck.reason}`
      );
      return false;
    }

    // Add window with lastSeenAt timestamp
    const trackedWindow: TrackedWindowInfo = {
      ...window,
      lastSeenAt: Date.now(),
    };
    this.selectedWindows.set(window.windowId, trackedWindow);
    logger.info(
      `[WindowDetectionService] Added window to watch list: ${window.appName} (${window.windowTitle}) [${window.windowId}]`
    );
    logger.info(` Now watching ${this.selectedWindows.size} windows`);
    return true;
  }

  /**
   * Remove a window from the watch list
   *
   * @param windowId - ID of the window to stop watching
   * @returns true if removed, false if it wasn't being watched
   */
  removeWindow(windowId: string): boolean {
    const removed = this.selectedWindows.delete(windowId);
    if (removed) {
      logger.info(` Removed window from watch list: ${windowId}`);
      logger.info(` Now watching ${this.selectedWindows.size} windows`);
    }
    return removed;
  }

  /**
   * Get list of currently selected windows
   *
   * @returns Array of window info currently being watched
   */
  getSelectedWindows(): SelectedWindowInfo[] {
    // Strip lastSeenAt metadata before returning
    return Array.from(this.selectedWindows.values()).map((w) => ({
      windowId: w.windowId,
      appName: w.appName,
      windowTitle: w.windowTitle,
      displayName: w.displayName,
      tabTitle: w.tabTitle,
      isBrowser: w.isBrowser,
    }));
  }

  /**
   * Get internal details for a detected window by ID
   *
   * Used by watch mode selection to resolve processId/app/path.
   */
  getWindowDetails(windowId: string):
    | {
        title: string;
        appName: string;
        processId?: number;
        bundleId?: string;
        path?: string;
      }
    | undefined {
    const window = this.lastDetectedWindows.get(windowId);
    if (!window) {
      return undefined;
    }

    return {
      title: window.title,
      appName: window.owner.name,
      processId: window.owner.processId,
      bundleId: window.owner.bundleId,
      path: window.owner.path,
    };
  }

  /**
   * Get list of selected window IDs only
   *
   * @returns Array of window IDs being watched
   */
  getSelectedWindowIds(): string[] {
    return Array.from(this.selectedWindows.keys());
  }

  /**
   * Clear all selected apps
   */
  clearAll(): void {
    const count = this.selectedWindows.size;
    this.selectedWindows.clear();
    logger.info(` Cleared all ${count} windows from watch list`);

    // Also clear last detected OS windows when we stop watching
    const lastDetectedCount = this.lastDetectedWindows.size;
    this.lastDetectedWindows.clear();
    logger.info(
      `[WindowDetectionService] Cleared ${lastDetectedCount} entries from lastDetectedWindows`
    );
  }

  /**
   * Get current watch state
   *
   * @returns Current watch state including selected windows
   */
  getWatchState(): WatchState {
    return {
      isWatching: this.selectedWindows.size > 0, // Derived from list
      selectedWindows: this.getSelectedWindows(),
    };
  }

  /**
   * Set watch mode on/off
   * Note: isWatching is now derived from selectedWindows.size > 0
   * This method is kept for API compatibility but is effectively a no-op
   *
   * @param watching - Whether watch mode is active (ignored)
   */
  setWatchingMode(watching: boolean): void {
    // isWatching is derived from selectedWindows.size > 0
    // No separate flag to set
    logger.info(
      `[WindowDetectionService] Watch mode toggle: ${watching} (actual: ${this.selectedWindows.size > 0})`
    );
  }

  /**
   * Get statistics about current detection state
   */
  getStats(): {
    isWatching: boolean;
    selectedCount: number;
    selectedWindows: SelectedWindowInfo[];
  } {
    return {
      isWatching: this.selectedWindows.size > 0, // Derived from list
      selectedCount: this.selectedWindows.size,
      selectedWindows: this.getSelectedWindows(),
    };
  }

  /**
   * Get list of apps that have been detected (for block list management)
   * Returns array of normalized app names (lowercase)
   */
  getDetectedApps(): string[] {
    return Array.from(this.detectedApps.keys()).sort();
  }

  /**
   * Get original app name for a normalized app name
   */
  getOriginalAppName(normalizedAppName: string): string | undefined {
    return this.detectedApps.get(normalizedAppName.toLowerCase());
  }

  /**
   * Check for closed windows and remove them from watch list
   * Returns the list of windows that were removed (closed)
   *
   * NOTE: We no longer auto-remove windows based on get-windows enumeration failures.
   * Windows stay in the watch list until:
   * 1. User manually removes them (X button)
   * 2. Focus tracker's TTL expires (10 minutes for auto-tracked windows)
   *
   * This prevents false removals when:
   * - User interacts with Mitable UI (watch pill dropdown) causing brief focus shifts
   * - get-windows has intermittent enumeration issues with Citrix/RDP/VM windows
   */
  async checkForClosedWindows(): Promise<SelectedWindowInfo[]> {
    if (this.selectedWindows.size === 0) {
      return [];
    }

    try {
      const { openWindows } = await import("get-windows");
      const currentWindows = await openWindows();

      // Build set of currently open window IDs
      const openWindowIds = new Set(currentWindows.map((w) => w.id.toString()));

      // Find selected windows that are no longer open
      const closedWindows: SelectedWindowInfo[] = [];

      for (const [windowId, windowInfo] of this.selectedWindows) {
        if (!openWindowIds.has(windowId)) {
          // Window not in get-windows results
          // Keep it anyway - don't auto-remove based on enumeration failures
          // Focus tracker's TTL will handle cleanup for auto-tracked windows
          logger.info(
            `[WindowDetectionService] Window not enumerable but keeping in watch list: ${windowInfo.appName} (${windowInfo.windowTitle}) [${windowId}]`
          );
        }
      }

      // Never auto-remove windows - they stay until manually removed or focus tracker TTL expires
      return closedWindows;
    } catch (error) {
      // Only log once to avoid spam (permission issues will persist)
      if (!this.permissionWarningLogged) {
        logger.warn(
          " Screen Recording permission may not be granted. Closed window detection disabled. Grant permission in System Settings > Privacy & Security > Screen Recording."
        );
        this.permissionWarningLogged = true;
      }
      return [];
    }
  }
}

// Export singleton instance
export const windowDetectionService = new WindowDetectionService();
