/**
 * Installed Applications Discovery Service
 *
 * Discovers all installed applications on macOS and Windows for proactive
 * blocking. Users can block apps before they've been detected through
 * window monitoring.
 *
 * Features:
 * - macOS: Scans /Applications and ~/Applications, parses .app bundles
 * - Windows: Queries registry + scans Program Files directories
 * - 24-hour cache using electron-store to avoid frequent rescans
 * - Normalizes app names consistently with windowDetectionService
 *
 * @module installedAppsService
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import Store from "electron-store";
import { createLogger } from "../lib/logger";

const execAsync = promisify(exec);
const logger = createLogger("InstalledAppsService");

export interface InstalledApp {
  name: string; // Display name (e.g., "Visual Studio Code")
  normalizedName: string; // Lowercase, no extension
  bundleId?: string; // macOS bundle identifier
  path?: string; // Install path
}

interface CacheData {
  apps: InstalledApp[];
  lastUpdated: number;
  platform: string;
}

// Cache TTL: 24 hours in milliseconds
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// System apps to filter out (not useful for blocking)
const SYSTEM_APP_PATTERNS = [
  /^system/i,
  /^finder$/i,
  /^loginwindow$/i,
  /^dock$/i,
  /^systemuiserver$/i,
  /^notification center$/i,
  /^control center$/i,
  /^screencaptureui$/i,
  /^universalcontrol$/i,
  /^accessibility$/i,
  /^keychain/i,
  /^installer$/i,
  /^software update$/i,
  /^migration assistant$/i,
  /^boot camp/i,
  /^directory utility$/i,
  /^disk utility$/i,
  /^screen sharing$/i,
  /^bluetooth file exchange$/i,
  /^audio midi setup$/i,
  /^colorsync utility$/i,
  /^console$/i,
  /^grapher$/i,
  /^voiceover utility$/i,
  /^airdrop$/i,
  /^sidecar$/i,
];

class InstalledAppsService {
  private store: Store<{ installedAppsCache: CacheData }>;
  private isScanning = false;

  constructor() {
    this.store = new Store<{ installedAppsCache: CacheData }>({
      name: "installed-apps-cache",
      defaults: {
        installedAppsCache: {
          apps: [],
          lastUpdated: 0,
          platform: "",
        },
      },
    });
    logger.info("Initialized");
  }

  /**
   * Get all installed applications
   * Returns cached data if valid, otherwise performs fresh scan
   *
   * @param forceRefresh - Force a fresh scan even if cache is valid
   * @returns Array of installed applications
   */
  async getInstalledApps(forceRefresh = false): Promise<InstalledApp[]> {
    const cache = this.store.get("installedAppsCache");
    const now = Date.now();
    const platform = process.platform;

    // Check if cache is valid
    const cacheValid =
      !forceRefresh &&
      cache.apps.length > 0 &&
      cache.platform === platform &&
      now - cache.lastUpdated < CACHE_TTL_MS;

    if (cacheValid) {
      logger.info(`Returning ${cache.apps.length} apps from cache`);
      return cache.apps;
    }

    // Perform fresh scan
    return this.refreshCache();
  }

  /**
   * Force a fresh scan of installed applications
   * @returns Array of installed applications
   */
  async refreshCache(): Promise<InstalledApp[]> {
    if (this.isScanning) {
      logger.warn("Scan already in progress, waiting...");
      // Wait for current scan to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
      return this.store.get("installedAppsCache").apps;
    }

    this.isScanning = true;
    logger.info("Starting fresh scan of installed applications");

    try {
      let apps: InstalledApp[];

      if (process.platform === "darwin") {
        apps = await this.scanMacApps();
      } else if (process.platform === "win32") {
        apps = await this.scanWindowsApps();
      } else {
        logger.warn(`Unsupported platform: ${process.platform}`);
        apps = [];
      }

      // Filter out system apps and deduplicate
      const filteredApps = this.filterAndDeduplicate(apps);

      // Update cache
      this.store.set("installedAppsCache", {
        apps: filteredApps,
        lastUpdated: Date.now(),
        platform: process.platform,
      });

      logger.info(`Scan complete: ${filteredApps.length} apps found`);
      return filteredApps;
    } catch (error) {
      logger.error("Error scanning installed apps:", error);
      // Return cached data as fallback
      return this.store.get("installedAppsCache").apps;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan macOS Applications folders
   */
  private async scanMacApps(): Promise<InstalledApp[]> {
    const apps: InstalledApp[] = [];
    const homeDir = os.homedir();

    // Directories to scan
    const appDirs = ["/Applications", path.join(homeDir, "Applications")];

    for (const dir of appDirs) {
      try {
        if (!fs.existsSync(dir)) {
          continue;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.endsWith(".app")) {
            const appPath = path.join(dir, entry.name);
            const appInfo = await this.parseMacAppBundle(appPath);

            if (appInfo) {
              apps.push(appInfo);
            }
          }
        }
      } catch (error) {
        logger.warn(`Error scanning directory ${dir}:`, error);
      }
    }

    return apps;
  }

  /**
   * Parse a macOS .app bundle to extract app info
   */
  private async parseMacAppBundle(appPath: string): Promise<InstalledApp | null> {
    const infoPlistPath = path.join(appPath, "Contents", "Info.plist");

    try {
      // Check if Info.plist exists
      if (!fs.existsSync(infoPlistPath)) {
        // Fallback to directory name
        const appName = path.basename(appPath, ".app");
        return {
          name: appName,
          normalizedName: this.normalizeAppName(appName),
          path: appPath,
        };
      }

      // Use plutil to convert plist to JSON (more reliable than parsing XML)
      const { stdout } = await execAsync(`plutil -convert json -o - "${infoPlistPath}"`);
      const plist = JSON.parse(stdout);

      // Extract display name (prefer CFBundleDisplayName, fallback to CFBundleName)
      const displayName =
        plist.CFBundleDisplayName || plist.CFBundleName || path.basename(appPath, ".app");

      const bundleId = plist.CFBundleIdentifier;

      return {
        name: displayName,
        normalizedName: this.normalizeAppName(displayName),
        bundleId,
        path: appPath,
      };
    } catch (error) {
      // Fallback to directory name
      const appName = path.basename(appPath, ".app");
      return {
        name: appName,
        normalizedName: this.normalizeAppName(appName),
        path: appPath,
      };
    }
  }

  /**
   * Scan Windows installed applications
   */
  private async scanWindowsApps(): Promise<InstalledApp[]> {
    const apps: InstalledApp[] = [];

    try {
      // Query registry for installed apps using PowerShell
      const registryPaths = [
        "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
        "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
        "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
      ];

      for (const regPath of registryPaths) {
        try {
          const { stdout } = await execAsync(
            `powershell -NoProfile -NonInteractive -Command "Get-ItemProperty '${regPath}' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName, InstallLocation | ConvertTo-Json -Compress"`,
            { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
          );

          if (stdout.trim()) {
            let entries = JSON.parse(stdout);

            // PowerShell returns a single object if there's only one result
            if (!Array.isArray(entries)) {
              entries = [entries];
            }

            for (const entry of entries) {
              if (entry.DisplayName) {
                apps.push({
                  name: entry.DisplayName,
                  normalizedName: this.normalizeAppName(entry.DisplayName),
                  path: entry.InstallLocation || undefined,
                });
              }
            }
          }
        } catch (error) {
          logger.warn(`Error querying registry path ${regPath}:`, error);
        }
      }
    } catch (error) {
      logger.error("Error scanning Windows apps:", error);
    }

    return apps;
  }

  /**
   * Normalize app name by removing OS-specific extensions and lowercasing
   */
  private normalizeAppName(appName: string): string {
    if (!appName) return "";
    return appName
      .replace(/\.exe$/i, "")
      .replace(/\.app$/i, "")
      .replace(/\.AppImage$/i, "")
      .toLowerCase()
      .trim();
  }

  /**
   * Filter out system apps and deduplicate by normalized name
   */
  private filterAndDeduplicate(apps: InstalledApp[]): InstalledApp[] {
    const seen = new Map<string, InstalledApp>();

    for (const app of apps) {
      // Skip system apps
      if (this.isSystemApp(app.name)) {
        continue;
      }

      // Skip empty names
      if (!app.normalizedName) {
        continue;
      }

      // Prefer entries with more info (bundle ID, path)
      const existing = seen.get(app.normalizedName);
      if (!existing || (app.bundleId && !existing.bundleId) || (app.path && !existing.path)) {
        seen.set(app.normalizedName, app);
      }
    }

    // Sort alphabetically by display name
    return Array.from(seen.values()).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }

  /**
   * Check if an app is a system app that shouldn't be in the block list
   */
  private isSystemApp(appName: string): boolean {
    return SYSTEM_APP_PATTERNS.some((pattern) => pattern.test(appName));
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { appCount: number; lastUpdated: Date | null; cacheAge: number } {
    const cache = this.store.get("installedAppsCache");
    return {
      appCount: cache.apps.length,
      lastUpdated: cache.lastUpdated ? new Date(cache.lastUpdated) : null,
      cacheAge: cache.lastUpdated ? Date.now() - cache.lastUpdated : -1,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.store.set("installedAppsCache", {
      apps: [],
      lastUpdated: 0,
      platform: "",
    });
    logger.info("Cache cleared");
  }
}

// Export singleton instance
export const installedAppsService = new InstalledAppsService();
