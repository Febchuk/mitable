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
import { desktopCapturer } from "electron";
import { isBlockedByPolicy, getCapturePolicy } from "./capturePolicy";
import { isBrowserApp, parseBrowserTitle, isSystemApp } from "../utils/browserTitleParser";
import { createLogger } from "../lib/logger";
import { installedAppsService } from "./installedAppsService";

/**
 * Represents an app that can be added to the block list
 */
export interface BlockableApp {
  normalizedName: string; // Lowercase key for matching
  originalName: string; // Display name
  source: "detected" | "installed" | "both"; // How the app was discovered
  bundleId?: string; // macOS bundle identifier (if from installed apps)
  path?: string; // Install path (if from installed apps)
}

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

  // Track which RDP/Citrix windows we've already logged (to avoid spam every 2s)
  private rdpWindowsLogged: Set<string> = new Set();

  // Throttle "window not found" logs per window (avoid spam every 2s)
  private lastMissingLogTime: Map<string, number> = new Map();
  private static readonly MISSING_LOG_THROTTLE_MS = 60_000;

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

      // Supplement with desktopCapturer to catch windows that get-windows misses
      // (e.g., Citrix HDX Engine, RDP child windows)
      try {
        const dcSources = await desktopCapturer.getSources({
          types: ["window"],
          fetchWindowIcons: false,
        });

        const knownTitles = new Set(watchableWindows.map((w) => w.windowTitle));

        for (const source of dcSources) {
          const title = source.name;
          if (!title || title.trim() === "" || knownTitles.has(title)) continue;
          if (this.isMitableWindow(title)) continue;

          const titleParts = title.split(" - ");
          const dcAppName = titleParts.length > 1 ? titleParts[titleParts.length - 1] : title;
          if (isSystemApp(dcAppName)) continue;

          const dcPolicy = isBlockedByPolicy(title, dcAppName, policy);
          const dcIsBrowser = isBrowserApp(dcAppName);
          const dcParsed = parseBrowserTitle(title, dcAppName);

          watchableWindows.push({
            windowId: source.id,
            appName: dcAppName,
            windowTitle: title,
            displayName: dcParsed.browserDisplayName,
            tabTitle: dcIsBrowser ? dcParsed.tabTitle : undefined,
            isBrowser: dcIsBrowser,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            isBlocked: dcPolicy.blocked,
            blockReason: dcPolicy.reason,
          });

          logger.info(
            ` [desktopCapturer supplement] Found: ${dcAppName} - ${title.substring(0, 50)}`
          );
        }
      } catch (dcError) {
        logger.warn(" desktopCapturer supplement failed (non-fatal):", (dcError as Error)?.message);
      }

      logger.info(
        `[WindowDetectionService] Returning ${watchableWindows.length} watchable windows`
      );
      return watchableWindows;
    } catch (error) {
      logger.warn(
        " get-windows failed, trying desktopCapturer fallback:",
        (error as Error)?.message
      );

      // Fallback to desktopCapturer when get-windows fails
      try {
        return await this.getVisibleWindowsFromDesktopCapturer();
      } catch (fallbackError) {
        logger.error(" desktopCapturer fallback also failed:", fallbackError);
        logger.error(" Error details:", {
          name: (fallbackError as Error)?.name,
          message: (fallbackError as Error)?.message,
          stack: (fallbackError as Error)?.stack,
        });
        // Return empty array as last resort - UI will show "No windows available"
        return [];
      }
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
   * Fallback window detection using Electron's desktopCapturer
   * Used when get-windows fails (e.g., permission issues, binary failures)
   *
   * Note: desktopCapturer provides less metadata than get-windows but is more reliable
   */
  private async getVisibleWindowsFromDesktopCapturer(): Promise<WatchableWindow[]> {
    logger.info(" Using desktopCapturer fallback for window detection");

    const sources = await desktopCapturer.getSources({
      types: ["window"],
      fetchWindowIcons: false,
    });

    const policy = getCapturePolicy();
    const watchableWindows: WatchableWindow[] = [];

    for (const source of sources) {
      const windowTitle = source.name;

      // Skip empty titles
      if (!windowTitle || windowTitle.trim() === "") {
        continue;
      }

      // Skip Mitable windows
      if (this.isMitableWindow(windowTitle)) {
        continue;
      }

      // Extract app name from title (desktopCapturer doesn't provide app name separately)
      // Common pattern: "Tab Title - App Name" or just "App Name"
      const titleParts = windowTitle.split(" - ");
      const appName = titleParts.length > 1 ? titleParts[titleParts.length - 1] : windowTitle;

      // Skip system apps
      if (isSystemApp(appName)) {
        continue;
      }

      // Check capture policy
      const policyDecision = isBlockedByPolicy(windowTitle, appName, policy);

      // Parse browser title for better display
      const isBrowser = isBrowserApp(appName);
      const parsed = parseBrowserTitle(windowTitle, appName);

      watchableWindows.push({
        windowId: source.id, // desktopCapturer uses string IDs like "window:123:0"
        appName,
        windowTitle,
        displayName: parsed.browserDisplayName,
        tabTitle: isBrowser ? parsed.tabTitle : undefined,
        isBrowser,
        bounds: { x: 0, y: 0, width: 0, height: 0 }, // desktopCapturer doesn't provide bounds
        isBlocked: policyDecision.blocked,
        blockReason: policyDecision.reason,
      });
    }

    logger.info(` desktopCapturer fallback returned ${watchableWindows.length} windows`);
    return watchableWindows;
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

  // Apps always excluded from detection/watch list (includes-based for helper processes)
  private static readonly ALWAYS_EXCLUDED_APPS: { pattern: string; reason: string }[] = [
    { pattern: "mitable", reason: "Mitable app" },
    { pattern: "electron", reason: "Electron window" },
    { pattern: "messages", reason: "Messages app" },
    { pattern: "whatsapp", reason: "WhatsApp app" },
    { pattern: "spotify", reason: "Spotify app" },
    { pattern: "imessage", reason: "iMessage app" },
  ];

  /**
   * Check if a window should be excluded from being added to the watch list.
   * Uses `includes`-based matching so macOS helper/renderer processes
   * (e.g. "WhatsApp Helper", "Spotify Helper (Renderer)") are caught.
   */
  private shouldExcludeWindow(
    windowTitle: string,
    appName: string
  ): { excluded: boolean; reason?: string } {
    // Check 1: Mitable windows by title
    if (this.isMitableWindow(windowTitle)) {
      return { excluded: true, reason: "Mitable window" };
    }

    // Check 2: Always-excluded apps by name (includes-based for helper processes)
    const lowerAppName = this.normalizeAppName(appName).toLowerCase();
    const lowerTitle = (windowTitle || "").toLowerCase();

    for (const { pattern, reason } of WindowDetectionService.ALWAYS_EXCLUDED_APPS) {
      if (lowerAppName.includes(pattern) || lowerTitle === pattern) {
        return { excluded: true, reason };
      }
    }

    // Check 3: Policy-blocked windows
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

    // Also clear last detected OS windows and log tracking when we stop watching
    const lastDetectedCount = this.lastDetectedWindows.size;
    this.lastDetectedWindows.clear();
    this.rdpWindowsLogged.clear();
    this.lastMissingLogTime.clear();
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
   * Get all blockable apps (merged from detected and installed)
   * Priority: detected app names take precedence (more accurate from runtime)
   *
   * @param forceRefresh - Force a fresh scan of installed apps
   * @returns Array of blockable apps sorted alphabetically
   */
  async getAllBlockableApps(forceRefresh = false): Promise<BlockableApp[]> {
    const mergedApps = new Map<string, BlockableApp>();

    // 1. Start with detected apps (runtime detected, most accurate names)
    for (const [normalized, original] of this.detectedApps) {
      mergedApps.set(normalized, {
        normalizedName: normalized,
        originalName: original,
        source: "detected",
      });
    }

    // 2. Merge installed apps
    try {
      const installedApps = await installedAppsService.getInstalledApps(forceRefresh);

      for (const app of installedApps) {
        const existing = mergedApps.get(app.normalizedName);

        if (existing) {
          // App exists in both - mark as "both" and keep detected name (more accurate)
          existing.source = "both";
          // Add additional info from installed apps
          if (app.bundleId) existing.bundleId = app.bundleId;
          if (app.path) existing.path = app.path;
        } else {
          // Only in installed apps
          mergedApps.set(app.normalizedName, {
            normalizedName: app.normalizedName,
            originalName: app.name,
            source: "installed",
            bundleId: app.bundleId,
            path: app.path,
          });
        }
      }
    } catch (error) {
      logger.warn("Error getting installed apps, using detected apps only:", error);
    }

    // 3. Filter out apps that shouldn't be blockable
    const filteredApps = Array.from(mergedApps.values()).filter((app) => {
      const normalized = app.normalizedName.toLowerCase();
      // Exclude Mitable itself
      if (normalized === "mitable" || normalized === "electron") {
        return false;
      }
      // Exclude system apps
      if (isSystemApp(app.originalName)) {
        return false;
      }
      return true;
    });

    // 4. Sort alphabetically by display name
    return filteredApps.sort((a, b) =>
      a.originalName.toLowerCase().localeCompare(b.originalName.toLowerCase())
    );
  }

  /**
   * Refresh the installed apps cache
   * Call this when user clicks "Refresh App List" button
   */
  async refreshInstalledApps(): Promise<void> {
    await installedAppsService.refreshCache();
    logger.info("Installed apps cache refreshed");
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

      // RDP/Citrix patterns — these apps are invisible to get-windows
      // so absence from the enumeration is NOT proof of closure
      const rdpPatterns = [
        "citrix",
        "hdx",
        "wfica",
        "remote desktop",
        "mstsc",
        "vmware horizon",
        "vmconnect",
      ];
      const isRdpApp = (name: string) => {
        const lower = name.toLowerCase();
        return rdpPatterns.some((p) => lower.includes(p));
      };

      for (const [windowId, windowInfo] of this.selectedWindows) {
        if (!openWindowIds.has(windowId)) {
          // Skip RDP/Citrix — get-windows can't see them even when open
          if (isRdpApp(windowInfo.appName)) {
            // Log only once per window to avoid spam (checkForClosedWindows runs every 2s)
            if (!this.rdpWindowsLogged.has(windowId)) {
              this.rdpWindowsLogged.add(windowId);
              logger.info(
                `[WindowDetectionService] Keeping RDP/Citrix window (invisible to get-windows): ${windowInfo.appName} [${windowId}]`
              );
            }
            continue;
          }
          // NOTE: We no longer auto-remove windows based on get-windows enumeration failures.
          // Windows stay in the watch list until:
          // 1. User manually removes them (X button)
          // 2. Focus tracker's TTL expires (10 minutes for auto-tracked windows)
          //
          // This handles cases where windows are temporarily invisible (e.g. other Spaces, full-screen)
          // or get-windows fails to enumerate them reliably.
          const now = Date.now();
          const lastLog = this.lastMissingLogTime.get(windowId) ?? 0;
          if (now - lastLog >= WindowDetectionService.MISSING_LOG_THROTTLE_MS) {
            this.lastMissingLogTime.set(windowId, now);
            logger.info(
              `[WindowDetectionService] Window not found in enumeration (keeping it): ${windowInfo.appName} (${windowInfo.windowTitle}) [${windowId}]`
            );
          }
          continue;
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
