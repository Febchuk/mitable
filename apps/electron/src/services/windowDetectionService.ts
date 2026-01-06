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

class WindowDetectionService {
  // Track which windows user has selected to watch
  private selectedWindows: Map<string, SelectedWindowInfo> = new Map();
  // Note: isWatching is derived from selectedWindows.size > 0 (no separate flag)

  // Last detected OS windows keyed by windowId (stringified)
  private lastDetectedWindows: Map<string, GetWindowsResult> = new Map();

  // Track if we've logged the permission warning to avoid spam
  private permissionWarningLogged = false;

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
        // Skip Mitable's own windows
        if (this.isMitableWindow(window.title)) {
          logger.info(` Skipping Mitable window: ${window.title}`);
          continue;
        }

        // Skip windows with no title (system windows, etc.)
        if (!window.title || window.title.trim() === "") {
          continue;
        }

        const appName = window.owner.name;
        const windowTitle = window.title;

        // Skip system apps (Finder, Notification Center, etc.)
        if (isSystemApp(appName)) {
          logger.info(` Skipping system app: ${appName}`);
          continue;
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
   * Add a window to the watch list
   *
   * @param window - Window metadata to track
   * @returns true if added, false if already watching
   */
  addWindow(window: SelectedWindowInfo): boolean {
    if (this.selectedWindows.has(window.windowId)) {
      return false;
    }
    this.selectedWindows.set(window.windowId, window);
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
    return Array.from(this.selectedWindows.values());
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
   * Check for closed windows and remove them from watch list
   * Returns the list of windows that were removed (closed)
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
          closedWindows.push(windowInfo);
          this.selectedWindows.delete(windowId);
          logger.info(
            `[WindowDetectionService] Window closed, removed from watch list: ${windowInfo.appName} (${windowInfo.windowTitle}) [${windowId}]`
          );
        }
      }

      if (closedWindows.length > 0) {
        logger.info(
          `[WindowDetectionService] Removed ${closedWindows.length} closed windows, now watching ${this.selectedWindows.size}`
        );
      }

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
