import { autoUpdater } from "electron-updater";
import { app, BrowserWindow } from "electron";
import log from "electron-log";

class UpdateService {
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private isCheckingForUpdates = false;
  private maxRetries = 3;
  private currentRetry = 0;
  private usingGitHubFallback = false;

  constructor() {
    // Configure logger
    autoUpdater.logger = log;
    log.transports.file.level = "info";

    // Disable auto-download - we want user to click first
    autoUpdater.autoDownload = false;

    // Disable auto-install on app quit
    autoUpdater.autoInstallOnAppQuit = false;

    // Set request headers for better cache handling
    autoUpdater.requestHeaders = {
      "Cache-Control": "no-cache",
    };

    // Allow pre-release updates if user is on a pre-release version
    autoUpdater.allowPrerelease = false;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    autoUpdater.on("checking-for-update", () => {
      log.info("[UpdateService] Checking for updates...");
      this.isCheckingForUpdates = true;
    });

    autoUpdater.on("update-available", (info) => {
      log.info("[UpdateService] Update available:", info.version);
      this.isCheckingForUpdates = false;
      this.notifyRenderers("update-available", {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      log.info("[UpdateService] Update not available. Current version:", info.version);
      this.isCheckingForUpdates = false;
      this.notifyRenderers("update-not-available", {
        version: info.version,
      });
    });

    autoUpdater.on("error", async (err) => {
      const errorMessage = err?.message || String(err);
      log.error("[UpdateService] Error checking for updates:", errorMessage);
      this.isCheckingForUpdates = false;

      // If the error is about invalid URL, try GitHub fallback
      if (errorMessage.includes("Invalid URL") && !this.usingGitHubFallback) {
        log.warn("[UpdateService] Primary update URL invalid, switching to GitHub fallback...");
        this.useGitHubProvider();
        try {
          this.isCheckingForUpdates = true;
          await autoUpdater.checkForUpdates();
          return; // Success with fallback, don't notify error
        } catch (fallbackError: any) {
          log.error("[UpdateService] GitHub fallback also failed:", fallbackError?.message);
        }
      }

      this.notifyRenderers("update-error", {
        message: errorMessage.includes("Invalid URL")
          ? "Update server configuration error. Please update manually from GitHub."
          : errorMessage || "An error occurred while checking for updates",
      });
    });

    autoUpdater.on("download-progress", (progressObj) => {
      log.info(
        `[UpdateService] Download progress: ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`
      );
      this.notifyRenderers("update-download-progress", {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      log.info("[UpdateService] Update downloaded:", info.version);
      this.notifyRenderers("update-downloaded", {
        version: info.version,
      });
    });
  }

  private notifyRenderers(channel: string, data: any) {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }

  /**
   * Configure GitHub as the update provider (fallback when R2 URL is invalid)
   */
  private useGitHubProvider(): void {
    log.info("[UpdateService] Switching to GitHub provider for updates");
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "Febchuk",
      repo: "mitable",
      private: true,
      token: process.env.GH_TOKEN,
    });
    this.usingGitHubFallback = true;
  }

  /**
   * Check for updates manually
   */
  async checkForUpdates(): Promise<void> {
    if (this.isCheckingForUpdates) {
      log.info("[UpdateService] Already checking for updates, skipping...");
      return;
    }

    // Don't check for updates in development
    if (!app.isPackaged) {
      log.info("[UpdateService] Skipping update check in development mode");
      this.notifyRenderers("update-error", {
        message: "Updates are only available in production builds",
      });
      return;
    }

    try {
      log.info("[UpdateService] Manually checking for updates...");
      log.info(`[UpdateService] Using ${this.usingGitHubFallback ? "GitHub (fallback)" : "primary"} provider`);
      await autoUpdater.checkForUpdates();
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      log.error("[UpdateService] Failed to check for updates:", errorMessage);

      // If the error is about invalid URL, try GitHub fallback
      if (errorMessage.includes("Invalid URL") && !this.usingGitHubFallback) {
        log.warn("[UpdateService] Primary update URL invalid, trying GitHub fallback...");
        this.useGitHubProvider();
        try {
          await autoUpdater.checkForUpdates();
          return; // Success with fallback
        } catch (fallbackError: any) {
          log.error("[UpdateService] GitHub fallback also failed:", fallbackError?.message);
          this.notifyRenderers("update-error", {
            message: "Unable to check for updates. Please try again later.",
          });
        }
      }
    }
  }

  /**
   * Start automatic periodic update checks
   * @param intervalMinutes How often to check for updates (default: 60 minutes)
   */
  startPeriodicChecks(intervalMinutes: number = 60) {
    // Initial check after 1 minute
    setTimeout(() => {
      this.checkForUpdates();
    }, 60 * 1000);

    // Then check periodically
    this.updateCheckInterval = setInterval(
      () => {
        this.checkForUpdates();
      },
      intervalMinutes * 60 * 1000
    );

    log.info(`[UpdateService] Started periodic update checks (every ${intervalMinutes} minutes)`);
  }

  /**
   * Stop automatic periodic update checks
   */
  stopPeriodicChecks() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      log.info("[UpdateService] Stopped periodic update checks");
    }
  }

  /**
   * Download the available update with retry logic for slow connections
   */
  async downloadUpdate(): Promise<void> {
    this.currentRetry = 0;
    await this.attemptDownload();
  }

  /**
   * Attempt to download update with exponential backoff retry
   */
  private async attemptDownload(): Promise<void> {
    try {
      log.info(
        `[UpdateService] Download attempt ${this.currentRetry + 1}/${this.maxRetries}...`
      );
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.currentRetry++;
      if (this.currentRetry < this.maxRetries) {
        const delay = Math.pow(2, this.currentRetry) * 1000; // Exponential backoff: 2s, 4s, 8s
        log.warn(
          `[UpdateService] Download failed, retrying in ${delay / 1000}s...`,
          error
        );

        // Notify renderers about retry
        this.notifyRenderers("update-download-retry", {
          attempt: this.currentRetry + 1,
          maxRetries: this.maxRetries,
          delaySeconds: delay / 1000,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
        await this.attemptDownload();
      } else {
        log.error(
          "[UpdateService] All download attempts failed after",
          this.maxRetries,
          "retries"
        );
        throw error;
      }
    }
  }

  /**
   * Quit the app and install the downloaded update
   */
  quitAndInstall(): void {
    log.info("[UpdateService] Quitting and installing update...");
    // setImmediate ensures the app quits immediately without waiting for pending operations
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
  }
}

export const updateService = new UpdateService();
