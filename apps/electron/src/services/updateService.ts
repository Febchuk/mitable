import { autoUpdater } from "electron-updater";
import { app, BrowserWindow } from "electron";
import log from "electron-log";

class UpdateService {
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private isCheckingForUpdates = false;

  constructor() {
    // Configure logger
    autoUpdater.logger = log;
    log.transports.file.level = "info";

    // Disable auto-download - we want user to click first
    autoUpdater.autoDownload = false;

    // Disable auto-install on app quit
    autoUpdater.autoInstallOnAppQuit = false;

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
    });

    autoUpdater.on("error", (err) => {
      log.error("[UpdateService] Error checking for updates:", err);
      this.isCheckingForUpdates = false;
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
      return;
    }

    try {
      log.info("[UpdateService] Manually checking for updates...");
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error("[UpdateService] Failed to check for updates:", error);
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
   * Download the available update
   */
  async downloadUpdate(): Promise<void> {
    try {
      log.info("[UpdateService] Starting update download...");
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error("[UpdateService] Failed to download update:", error);
      throw error;
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
