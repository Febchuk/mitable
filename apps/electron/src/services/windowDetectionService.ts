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

import type { WatchableWindow, WatchState } from "@mitable/shared";
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
  // Track which apps user has selected to watch
  private selectedApps: Set<string> = new Set();
  private isWatching: boolean = false;

  // Mitable window titles to exclude from detection
  private readonly MITABLE_WINDOW_PATTERNS = [
    /^Mitable/i,
    /^Agent/i,
    /^Console/i,
    /^Conversation/i,
    /^Overlay/i,
    /^Guide/i,
    /^Nudge/i,
    /Electron/i, // Electron dev tools
  ];

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
          windowId: window.id.toString(),
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
    return this.MITABLE_WINDOW_PATTERNS.some((pattern) => pattern.test(title));
  }

  /**
   * Add an app to the watch list
   *
   * @param appName - Name of the app to watch
   * @returns true if added, false if already watching
   */
  addApp(appName: string): boolean {
    if (this.selectedApps.has(appName)) {
      return false;
    }
    this.selectedApps.add(appName);
    console.log(`[WindowDetectionService] Added app to watch list: ${appName}`);
    console.log(`[WindowDetectionService] Now watching ${this.selectedApps.size} apps`);
    return true;
  }

  /**
   * Remove an app from the watch list
   *
   * @param appName - Name of the app to stop watching
   * @returns true if removed, false if wasn't watching
   */
  removeApp(appName: string): boolean {
    const removed = this.selectedApps.delete(appName);
    if (removed) {
      console.log(`[WindowDetectionService] Removed app from watch list: ${appName}`);
      console.log(`[WindowDetectionService] Now watching ${this.selectedApps.size} apps`);
    }
    return removed;
  }

  /**
   * Get list of currently selected apps
   *
   * @returns Array of app names being watched
   */
  getSelectedApps(): string[] {
    return Array.from(this.selectedApps);
  }

  /**
   * Clear all selected apps
   */
  clearAll(): void {
    const count = this.selectedApps.size;
    this.selectedApps.clear();
    console.log(`[WindowDetectionService] Cleared all ${count} apps from watch list`);
  }

  /**
   * Get current watch state
   *
   * @returns Current watch state including selected apps
   */
  getWatchState(): WatchState {
    return {
      isWatching: this.isWatching,
      selectedApps: this.getSelectedApps(),
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
   * Check if an app is currently selected for watching
   *
   * @param appName - Name of the app to check
   * @returns true if app is selected
   */
  isAppSelected(appName: string): boolean {
    return this.selectedApps.has(appName);
  }

  /**
   * Get statistics about current detection state
   */
  getStats(): {
    isWatching: boolean;
    selectedCount: number;
    selectedApps: string[]
  } {
    return {
      isWatching: this.isWatching,
      selectedCount: this.selectedApps.size,
      selectedApps: this.getSelectedApps(),
    };
  }
}

// Export singleton instance
export const windowDetectionService = new WindowDetectionService();