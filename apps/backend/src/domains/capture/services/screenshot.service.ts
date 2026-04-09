/**
 * Screenshot Service
 *
 * Manages screenshot storage and retrieval with automatic cleanup.
 * Screenshots are stored temporarily (30 seconds) for privacy.
 */

interface StoredScreenshot {
  data: string; // Base64-encoded image
  timestamp: number;
  expiresAt: number;
}

class ScreenshotService {
  private screenshots: Map<string, StoredScreenshot> = new Map();
  private readonly EXPIRY_MS = 30 * 1000; // 30 seconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Store a screenshot with automatic expiry
   *
   * @param screenshotId - Unique identifier for the screenshot
   * @param data - Base64-encoded screenshot data
   * @returns The screenshot ID
   */
  store(screenshotId: string, data: string): string {
    const now = Date.now();

    this.screenshots.set(screenshotId, {
      data,
      timestamp: now,
      expiresAt: now + this.EXPIRY_MS,
    });

    console.log(`[ScreenshotService] Stored screenshot: ${screenshotId}`);
    console.log(`[ScreenshotService] Current cache size: ${this.screenshots.size}`);

    return screenshotId;
  }

  /**
   * Retrieve a screenshot by ID
   *
   * @param screenshotId - The screenshot identifier
   * @returns Screenshot data or null if not found/expired
   */
  get(screenshotId: string): string | null {
    const screenshot = this.screenshots.get(screenshotId);

    if (!screenshot) {
      console.log(`[ScreenshotService] Screenshot not found: ${screenshotId}`);
      return null;
    }

    // Check if expired
    if (Date.now() > screenshot.expiresAt) {
      console.log(`[ScreenshotService] Screenshot expired: ${screenshotId}`);
      this.screenshots.delete(screenshotId);
      return null;
    }

    console.log(`[ScreenshotService] Retrieved screenshot: ${screenshotId}`);
    return screenshot.data;
  }

  /**
   * Delete a screenshot immediately
   *
   * @param screenshotId - The screenshot identifier
   */
  delete(screenshotId: string): void {
    const existed = this.screenshots.delete(screenshotId);
    if (existed) {
      console.log(`[ScreenshotService] Deleted screenshot: ${screenshotId}`);
    }
  }

  /**
   * Clean up expired screenshots
   */
  private cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, screenshot] of this.screenshots.entries()) {
      if (now > screenshot.expiresAt) {
        this.screenshots.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(
        `[ScreenshotService] Cleaned up ${deletedCount} expired screenshot(s). ` +
          `Remaining: ${this.screenshots.size}`
      );
    }
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10000);

    console.log("[ScreenshotService] Started cleanup interval");
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("[ScreenshotService] Stopped cleanup interval");
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    total: number;
    expired: number;
    active: number;
  } {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const screenshot of this.screenshots.values()) {
      if (now > screenshot.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.screenshots.size,
      expired,
      active,
    };
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();

// Clean up on process termination
process.on("SIGINT", () => {
  screenshotService.stopCleanup();
});

process.on("SIGTERM", () => {
  screenshotService.stopCleanup();
});
