/**
 * Screenshot Capture Service
 *
 * Provides multi-window screenshot capture for watch mode.
 * Focuses on policy-compliant capture of the windows the user explicitly selected,
 * with automatic resizing, temporary file handling, and metadata extraction.
 *
 * @module captureService
 */

import { desktopCapturer, screen, NativeImage, Display } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import { isBlockedByPolicy, getCapturePolicy } from "./capturePolicy";
import { createLogger } from "../lib/logger";

const logger = createLogger("CaptureService");
import type {
  MultiWindowCaptureResult,
  WindowScreenshot,
  BlockedWindowMetadata,
} from "@mitable/shared";

// ===========================
// Types & Interfaces
// ===========================

/**
 * Rectangle representing coordinates and dimensions
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Display information from Electron's screen API
 */
export interface DisplayInfo {
  id: number;
  bounds: Rectangle;
  workArea: Rectangle;
  scaleFactor: number;
  rotation: number;
  internal: boolean;
}

/**
 * Window metadata extracted from capture source
 */
export interface WindowMetadata {
  title: string;
  bounds: Rectangle;
  sourceId: string;
  display: DisplayInfo;
}

/**
 * Temporary file information
 */
interface TempFileInfo {
  filePath: string;
  createdAt: number;
  expiresAt: number;
  size: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  tempFileCount: number;
  totalTempFileSize: number;
  memoryUsageMB: number;
}

/**
 * Cached screenshot for watch mode fallback
 */
export interface CachedScreenshot {
  appName: string;
  windowTitle: string;
  dataUrl: string;
  capturedAt: number;
  metadata: {
    width: number;
    height: number;
    scaleFactor: number;
  };
}

// ===========================
// CaptureService Class
// ===========================

class CaptureService {
  private tempFiles: Map<string, TempFileInfo> = new Map();
  private readonly MAX_TEMP_FILES = 10;
  private readonly TEMP_FILE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly MAX_WIDTH = 1920;
  private readonly MAX_HEIGHT = 1080;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Screenshot cache for watch mode fallback (keyed by appName lowercase)
  private screenshotCache: Map<string, CachedScreenshot> = new Map();

  constructor() {
    this.startCleanupInterval();
    logger.info(" Initialized");
  }

  /**
   * Capture multiple visible windows (non-minimized) with capture policy filtering
   *
   * This method:
   * 1. Captures all visible windows using desktopCapturer
   * 2. Filters out blocked windows based on capture policy
   * 3. Optionally filters to only allowed windows (if provided)
   * 4. Returns screenshots for all selected windows (no limit)
   *
   * @param saveToFile - Whether to save screenshots to temp files (default: false)
   * @param allowedWindowIds - Optional list of OS window IDs to capture (if provided, only these windows are captured)
   * @returns Multi-window capture result with screenshots and blocked window metadata
   */
  async captureVisibleWindows(
    saveToFile: boolean = false,
    allowedWindowIds?: string[],
    userId?: string
  ): Promise<MultiWindowCaptureResult> {
    try {
      // STEP 1: Capture all window sources (includes ALL windows - unavoidable)
      // Note: Electron automatically excludes minimized windows
      const allSources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: {
          width: this.MAX_WIDTH * 2, // Allow for HiDPI
          height: this.MAX_HEIGHT * 2,
        },
      });

      if (allSources.length === 0) {
        logger.info(" No window sources found");
        return {
          success: false,
          error: "No windows detected on your desktop",
          reason: "no_window",
        };
      }

      logger.info(` Detected ${allSources.length} visible windows`);

      // STEP 2: Filter by capture policy IMMEDIATELY (discard blocked thumbnails)
      const policy = getCapturePolicy();
      const allowedWindows: typeof allSources = [];
      const blockedWindows: BlockedWindowMetadata[] = [];

      for (const source of allSources) {
        // Extract app name from source name (best effort)
        // Source name format is usually "AppName - Window Title" or just "Window Title"
        const appNameMatch = source.name.split(" - ")[0] || source.name;

        const policyDecision = isBlockedByPolicy(
          source.name,
          appNameMatch,
          policy,
          undefined,
          userId
        );

        if (policyDecision.blocked) {
          // Add to blocked list (metadata only, discard thumbnail)
          blockedWindows.push({
            windowTitle: source.name,
            appName: appNameMatch,
            reason: policyDecision.reason || "Blocked by capture policy",
          });

          logger.info(` 🚫 Blocked: ${source.name} (${policyDecision.reason})`);
          // Thumbnail is not stored - will be garbage collected
        } else {
          // Keep allowed window
          allowedWindows.push(source);
          logger.info(` ✅ Allowed: ${source.name}`);
        }
      }

      if (allowedWindows.length === 0) {
        logger.info(" All windows blocked by policy");
        return {
          success: false,
          error: `All ${allSources.length} detected windows are blocked by your organization's capture policy`,
          reason: "policy_blocked",
        };
      }

      // STEP 3: Filter by allowed window IDs if provided
      let windowsToCapture = allowedWindows;
      if (allowedWindowIds && allowedWindowIds.length > 0) {
        const normalizedAllowedIds = new Set<string>();
        for (const id of allowedWindowIds) {
          normalizedAllowedIds.add(id);
          normalizedAllowedIds.add(this.normalizeWindowSourceId(id));
        }

        windowsToCapture = allowedWindows.filter((source) => {
          const normalizedSourceId = this.normalizeWindowSourceId(source.id);
          return (
            normalizedAllowedIds.has(source.id) || normalizedAllowedIds.has(normalizedSourceId)
          );
        });

        logger.info(
          `Filtered to ${windowsToCapture.length} windows matching allowed IDs: ${allowedWindowIds.join(
            ", "
          )}`
        );
      }

      logger.info(` Capturing ${windowsToCapture.length} windows`);

      // STEP 4: Process each window into WindowScreenshot format
      const screenshots: WindowScreenshot[] = [];
      const display = screen.getPrimaryDisplay();

      for (const source of windowsToCapture) {
        // Get image and resize if needed
        let image = source.thumbnail;
        image = this.resizeIfNeeded(image, this.MAX_WIDTH, this.MAX_HEIGHT);
        const finalSize = image.getSize();

        // Convert to data URL
        const dataUrl = image.toDataURL();

        // Save to temp file if requested
        if (saveToFile) {
          const fileId = this.generateFileId();
          await this.saveToTemp(image, fileId);
        }

        // Extract app name from window title (best effort)
        const appNameMatch = source.name.split(" - ")[0] || source.name;

        screenshots.push({
          windowId: source.id,
          windowTitle: source.name,
          appName: appNameMatch,
          dataUrl,
          metadata: {
            width: finalSize.width,
            height: finalSize.height,
            scaleFactor: display.scaleFactor,
            bounds: {
              x: 0, // Not available from desktopCapturer
              y: 0,
              width: finalSize.width,
              height: finalSize.height,
            },
          },
        });
      }

      // STEP 5: Return success result
      return {
        success: true,
        screenshots,
        blockedWindows,
        totalWindowsDetected: allSources.length,
        captureTimestamp: Date.now(),
      };
    } catch (error) {
      logger.error(" Multi-window capture failed:", error);
      return {
        success: false,
        error: `Failed to capture windows: ${error instanceof Error ? error.message : "Unknown error"}`,
        reason: "technical_error",
      };
    }
  }

  /**
   * Normalize desktopCapturer window IDs to match OS-level window IDs
   *
   * @param id - Raw window source ID from desktopCapturer
   * @returns Normalized ID string
   */
  private normalizeWindowSourceId(id: string): string {
    if (!id) {
      return id;
    }

    if (id.startsWith("window:")) {
      const parts = id.split(":");
      if (parts.length >= 2 && parts[1]) {
        return parts[1];
      }
    }

    return id;
  }

  /**
   * Resize image if it exceeds maximum dimensions
   * Maintains aspect ratio
   *
   * @param image - NativeImage to resize
   * @param maxWidth - Maximum width
   * @param maxHeight - Maximum height
   * @returns Resized image (or original if within limits)
   */
  private resizeIfNeeded(image: NativeImage, maxWidth: number, maxHeight: number): NativeImage {
    const { width, height } = image.getSize();

    if (width <= maxWidth && height <= maxHeight) {
      return image; // No resize needed
    }

    // Calculate aspect ratio
    const aspectRatio = width / height;
    let newWidth = width;
    let newHeight = height;

    if (width > maxWidth) {
      newWidth = maxWidth;
      newHeight = Math.round(newWidth / aspectRatio);
    }

    if (newHeight > maxHeight) {
      newHeight = maxHeight;
      newWidth = Math.round(newHeight * aspectRatio);
    }

    logger.info(" Resizing image:", {
      original: { width, height },
      resized: { width: newWidth, height: newHeight },
    });

    return image.resize({ width: newWidth, height: newHeight });
  }

  /**
   * Save image to temporary file
   *
   * @param image - NativeImage to save
   * @param fileId - Unique file identifier
   * @returns File path
   */
  private async saveToTemp(image: NativeImage, fileId: string): Promise<string> {
    const fileName = `screenshot-${fileId}.png`;
    const filePath = join(tmpdir(), "mitable-screenshots", fileName);

    // Ensure directory exists
    await fs.mkdir(join(tmpdir(), "mitable-screenshots"), { recursive: true });

    // Save PNG file
    const pngBuffer = image.toPNG();
    await fs.writeFile(filePath, pngBuffer);

    // Track temp file
    const fileInfo: TempFileInfo = {
      filePath,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.TEMP_FILE_TTL_MS,
      size: pngBuffer.length,
    };

    this.tempFiles.set(fileId, fileInfo);

    // Enforce max temp files limit
    if (this.tempFiles.size > this.MAX_TEMP_FILES) {
      await this.cleanupOldestFile();
    }

    logger.info(" Saved to temp:", {
      fileId,
      filePath,
      size: pngBuffer.length,
      totalFiles: this.tempFiles.size,
    });

    return filePath;
  }

  /**
   * Generate unique file ID
   *
   * @returns Unique identifier
   */
  private generateFileId(): string {
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  }

  /**
   * Convert Electron Display to DisplayInfo
   *
   * @param display - Electron Display object
   * @returns DisplayInfo object
   */
  private displayToInfo(display: Display): DisplayInfo {
    return {
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal,
    };
  }

  /**
   * Get all connected displays
   *
   * @returns Array of display information
   */
  getAllDisplays(): DisplayInfo[] {
    return screen.getAllDisplays().map((display) => this.displayToInfo(display));
  }

  /**
   * Get primary display information
   *
   * @returns Primary display info
   */
  getPrimaryDisplay(): DisplayInfo {
    return this.displayToInfo(screen.getPrimaryDisplay());
  }

  /**
   * Clean up a specific temp file
   *
   * @param fileId - File identifier
   */
  async cleanupTemp(fileId: string): Promise<void> {
    const fileInfo = this.tempFiles.get(fileId);

    if (!fileInfo) {
      return;
    }

    try {
      await fs.unlink(fileInfo.filePath);
      this.tempFiles.delete(fileId);
      logger.info(" Cleaned up temp file:", fileId);
    } catch (error) {
      logger.error(" Failed to cleanup temp file:", fileId, error);
    }
  }

  /**
   * Clean up oldest temp file when limit is reached
   */
  private async cleanupOldestFile(): Promise<void> {
    let oldestFileId: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [fileId, fileInfo] of this.tempFiles.entries()) {
      if (fileInfo.createdAt < oldestTimestamp) {
        oldestTimestamp = fileInfo.createdAt;
        oldestFileId = fileId;
      }
    }

    if (oldestFileId) {
      await this.cleanupTemp(oldestFileId);
    }
  }

  /**
   * Clean up all expired temp files
   */
  private async cleanupExpiredFiles(): Promise<void> {
    const now = Date.now();
    const expiredFiles: string[] = [];

    for (const [fileId, fileInfo] of this.tempFiles.entries()) {
      if (now > fileInfo.expiresAt) {
        expiredFiles.push(fileId);
      }
    }

    if (expiredFiles.length > 0) {
      logger.info(` Cleaning up ${expiredFiles.length} expired temp file(s)`);
      await Promise.all(expiredFiles.map((fileId) => this.cleanupTemp(fileId)));
    }
  }

  /**
   * Clean up all temp files (for graceful shutdown)
   */
  async cleanupAll(): Promise<void> {
    logger.info(` Cleaning up all ${this.tempFiles.size} temp file(s)`);
    const fileIds = Array.from(this.tempFiles.keys());
    await Promise.all(fileIds.map((fileId) => this.cleanupTemp(fileId)));
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredFiles();
    }, this.CLEANUP_INTERVAL_MS);

    logger.info(" Started cleanup interval");
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info(" Stopped cleanup interval");
    }
  }

  /**
   * Get memory statistics
   *
   * @returns Memory stats object
   */
  getMemoryStats(): MemoryStats {
    let totalSize = 0;

    for (const fileInfo of this.tempFiles.values()) {
      totalSize += fileInfo.size;
    }

    const memoryUsage = process.memoryUsage();

    return {
      tempFileCount: this.tempFiles.size,
      totalTempFileSize: totalSize,
      memoryUsageMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
    };
  }

  // ===========================
  // Screenshot Cache Methods
  // ===========================

  /**
   * Cache a screenshot for an app (used for fallback when window not visible)
   *
   * @param appName - App name to use as cache key
   * @param screenshot - Screenshot data to cache
   */
  cacheScreenshot(appName: string, screenshot: CachedScreenshot): void {
    this.screenshotCache.set(appName.toLowerCase(), screenshot);
    logger.info(` Cached screenshot for ${appName}`);
  }

  /**
   * Get cached screenshot for an app
   *
   * @param appName - App name to look up
   * @returns Cached screenshot or undefined if not found
   */
  getCachedScreenshot(appName: string): CachedScreenshot | undefined {
    return this.screenshotCache.get(appName.toLowerCase());
  }

  /**
   * Clear cached screenshot for an app
   *
   * @param appName - App name to clear from cache
   */
  clearCachedScreenshot(appName: string): void {
    const deleted = this.screenshotCache.delete(appName.toLowerCase());
    if (deleted) {
      logger.info(` Cleared cached screenshot for ${appName}`);
    }
  }

  /**
   * Clear all cached screenshots
   */
  clearAllCachedScreenshots(): void {
    const count = this.screenshotCache.size;
    this.screenshotCache.clear();
    logger.info(` Cleared all ${count} cached screenshots`);
  }

  /**
   * Capture the primary screen (for full-screen Space fallback on macOS).
   * Uses desktopCapturer with type 'screen' when window sources are unavailable.
   * Returns a screenshot object compatible with the same downstream processing as window capture.
   */
  async captureScreen(): Promise<{
    windowId: string;
    windowTitle: string;
    appName: string;
    dataUrl: string;
  } | null> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: this.MAX_WIDTH * 2,
          height: this.MAX_HEIGHT * 2,
        },
      });

      const primarySource = sources[0];
      if (!primarySource) {
        logger.warn(" No screen source available for full-screen capture.");
        return null;
      }

      let image = primarySource.thumbnail;
      image = this.resizeIfNeeded(image, this.MAX_WIDTH, this.MAX_HEIGHT);
      const dataUrl = image.toDataURL();

      return {
        windowId: "screen:primary",
        windowTitle: "Full Screen",
        appName: "Screen",
        dataUrl,
      };
    } catch (err) {
      logger.error(" Screen capture failed:", err);
      return null;
    }
  }

  /**
   * Capture visible windows with cache fallback for selected apps
   *
   * This method:
   * 1. Attempts fresh capture of all visible windows
   * 2. Matches captured windows against selected apps by appName
   * 3. Falls back to cached screenshots for apps not currently visible
   * 4. Updates cache with fresh screenshots when available
   *
   * @param selectedApps - Array of apps to capture (by appName and windowTitle)
   * @returns Multi-window capture result with screenshots
   */
  async captureWithCacheFallback(
    selectedApps: Array<{ appName: string; windowTitle: string }>
  ): Promise<MultiWindowCaptureResult> {
    // Step 1: Fresh capture of all visible windows (no ID filtering)
    const freshResult = await this.captureVisibleWindows(false);

    // If complete failure, try returning cached screenshots only
    if (!freshResult.success || !freshResult.screenshots) {
      return this.returnCachedOnly(selectedApps, freshResult);
    }

    // Step 2: Match fresh screenshots by windowTitle (not appName!)
    // desktopCapturer returns window titles, not app names
    const selectedTitles = new Set(selectedApps.map((a) => a.windowTitle.toLowerCase()));
    const matchedScreenshots: WindowScreenshot[] = [];
    const matchedTitles = new Set<string>();

    for (const screenshot of freshResult.screenshots) {
      const titleLower = screenshot.windowTitle.toLowerCase();
      if (selectedTitles.has(titleLower)) {
        matchedScreenshots.push(screenshot);
        matchedTitles.add(titleLower);

        // Update cache with fresh screenshot (keyed by windowTitle)
        this.cacheScreenshot(screenshot.windowTitle, {
          appName: screenshot.appName,
          windowTitle: screenshot.windowTitle,
          dataUrl: screenshot.dataUrl,
          capturedAt: Date.now(),
          metadata: {
            width: screenshot.metadata.width,
            height: screenshot.metadata.height,
            scaleFactor: screenshot.metadata.scaleFactor,
          },
        });

        logger.info(` Fresh screenshot for ${screenshot.windowTitle}`);
      }
    }

    // Step 3: Fallback to cache for missing windows
    for (const app of selectedApps) {
      if (!matchedTitles.has(app.windowTitle.toLowerCase())) {
        const cached = this.getCachedScreenshot(app.windowTitle);
        if (cached) {
          matchedScreenshots.push({
            windowId: "cached",
            windowTitle: cached.windowTitle,
            appName: cached.appName,
            dataUrl: cached.dataUrl,
            metadata: {
              width: cached.metadata.width,
              height: cached.metadata.height,
              scaleFactor: cached.metadata.scaleFactor,
              bounds: {
                x: 0,
                y: 0,
                width: cached.metadata.width,
                height: cached.metadata.height,
              },
            },
          });
          logger.info(` Using cached screenshot for ${app.windowTitle}`);
        } else {
          logger.info(` No fresh or cached screenshot for ${app.windowTitle}`);
        }
      }
    }

    if (matchedScreenshots.length > 0) {
      return {
        success: true,
        screenshots: matchedScreenshots,
        blockedWindows: freshResult.blockedWindows,
        totalWindowsDetected: freshResult.totalWindowsDetected,
        captureTimestamp: Date.now(),
      };
    }

    return {
      success: false,
      error: "No screenshots captured - selected windows may not be visible",
      reason: "no_window",
    };
  }

  /**
   * Return cached screenshots only (when fresh capture fails)
   *
   * @param selectedApps - Apps to retrieve from cache
   * @param originalResult - Original failed result for error context
   * @returns Multi-window capture result with cached screenshots
   */
  private returnCachedOnly(
    selectedApps: Array<{ appName: string; windowTitle: string }>,
    originalResult: MultiWindowCaptureResult
  ): MultiWindowCaptureResult {
    const cachedScreenshots: WindowScreenshot[] = [];

    for (const app of selectedApps) {
      const cached = this.getCachedScreenshot(app.windowTitle);
      if (cached) {
        cachedScreenshots.push({
          windowId: "cached",
          windowTitle: cached.windowTitle,
          appName: cached.appName,
          dataUrl: cached.dataUrl,
          metadata: {
            width: cached.metadata.width,
            height: cached.metadata.height,
            scaleFactor: cached.metadata.scaleFactor,
            bounds: {
              x: 0,
              y: 0,
              width: cached.metadata.width,
              height: cached.metadata.height,
            },
          },
        });
        logger.info(`Using cached screenshot for ${app.windowTitle} (fresh failed)`);
      }
    }

    if (cachedScreenshots.length > 0) {
      return {
        success: true,
        screenshots: cachedScreenshots,
        blockedWindows: [],
        totalWindowsDetected: 0,
        captureTimestamp: Date.now(),
      };
    }

    // No cached screenshots available, return original error
    return originalResult;
  }
}

// ===========================
// Singleton Export
// ===========================

/**
 * Singleton instance of CaptureService
 */
export const captureService = new CaptureService();

// ===========================
// Process Cleanup
// ===========================

/**
 * Clean up on graceful shutdown
 */
process.on("SIGINT", async () => {
  logger.info(" Received SIGINT, cleaning up...");
  captureService.stopCleanup();
  await captureService.cleanupAll();
});

process.on("SIGTERM", async () => {
  logger.info(" Received SIGTERM, cleaning up...");
  captureService.stopCleanup();
  await captureService.cleanupAll();
});
