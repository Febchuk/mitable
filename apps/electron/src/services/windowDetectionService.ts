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
import { openWindows } from "get-windows";

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
  private isWatching: boolean = false;

  // Last detected OS windows keyed by windowId (stringified)
  private lastDetectedWindows: Map<string, GetWindowsResult> = new Map();

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
    console.log("[WindowDetectionService] Initialized");
  }

  /**
   * Get all visible windows, excluding Mitable's own windows
   * Marks windows as blocked based on capture policy
   *
   * @returns Array of watchable windows with policy status
   */
  async getAllVisibleWindows(): Promise<WatchableWindow[]> {
    try {
      // Get all windows using get-windows library
      const allWindows = await openWindows();

      console.log(`[WindowDetectionService] Detected ${allWindows.length} total windows`);

      const policy = getCapturePolicy();
      const watchableWindows: WatchableWindow[] = [];

      for (const window of allWindows) {
        const windowId = window.id.toString();

        // Track last seen metadata for later lookups (e.g., watch selection)
        this.lastDetectedWindows.set(windowId, window);
        // Skip Mitable's own windows
        if (this.isMitableWindow(window.title)) {
          console.log(`[WindowDetectionService] Skipping Mitable window: ${window.title}`);
          continue;
        }

        // Skip windows with no title (system windows, etc.)
        if (!window.title || window.title.trim() === "") {
          continue;
        }

        const appName = window.owner.name;
        const windowTitle = window.title;

        // Check capture policy
        const policyDecision = isBlockedByPolicy(windowTitle, appName, policy);

        const watchableWindow: WatchableWindow = {
          windowId,
          appName,
          windowTitle,
          bounds: window.bounds,
          isBlocked: policyDecision.blocked,
          blockReason: policyDecision.reason,
        };

        watchableWindows.push(watchableWindow);

        console.log(`[WindowDetectionService] Window detected:`, {
          app: appName,
          title: windowTitle.substring(0, 50) + (windowTitle.length > 50 ? "..." : ""),
          blocked: policyDecision.blocked,
          reason: policyDecision.reason,
        });
      }

      console.log(`[WindowDetectionService] Returning ${watchableWindows.length} watchable windows`);
      return watchableWindows;
    } catch (error) {
      console.error("[WindowDetectionService] Failed to get windows:", error);
      return [];
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
    console.log(
      `[WindowDetectionService] Added window to watch list: ${window.appName} (${window.windowTitle}) [${window.windowId}]`
    );
    console.log(`[WindowDetectionService] Now watching ${this.selectedWindows.size} windows`);
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
      console.log(`[WindowDetectionService] Removed window from watch list: ${windowId}`);
      console.log(`[WindowDetectionService] Now watching ${this.selectedWindows.size} windows`);
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
  getWindowDetails(windowId: string): {
    title: string;
    appName: string;
    processId?: number;
    bundleId?: string;
    path?: string;
  } | undefined {
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
    console.log(`[WindowDetectionService] Cleared all ${count} windows from watch list`);

    // Also clear last detected OS windows when we stop watching
    const lastDetectedCount = this.lastDetectedWindows.size;
    this.lastDetectedWindows.clear();
    console.log(
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
      isWatching: this.isWatching,
      selectedWindows: this.getSelectedWindows(),
    };
  }

  /**
   * Set watch mode on/off
   *
   * @param watching - Whether watch mode is active
   */
  setWatchingMode(watching: boolean): void {
    this.isWatching = watching;
    console.log(`[WindowDetectionService] Watch mode set to: ${watching}`);

    // Clear selections when turning off watch mode
    if (!watching) {
      this.clearAll();
    }
  }

  /**
   * Get statistics about current detection state
   */
  getStats(): {
    isWatching: boolean;
    selectedCount: number;
    selectedWindows: SelectedWindowInfo[]
  } {
    return {
      isWatching: this.isWatching,
      selectedCount: this.selectedWindows.size,
      selectedWindows: this.getSelectedWindows(),
    };
  }
}

// Export singleton instance
export const windowDetectionService = new WindowDetectionService();