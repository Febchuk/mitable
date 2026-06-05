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
  iconDataUrl?: string; // Base64 data URL of the app icon
}

interface CacheData {
  apps: InstalledApp[];
  lastUpdated: number;
  platform: string;
}

interface IconCacheData {
  icons: Record<string, string>; // normalizedName → data URL
  lastUpdated: number;
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
  private store: Store<{ installedAppsCache: CacheData; iconCache: IconCacheData }>;
  private isScanning = false;

  constructor() {
    this.store = new Store<{ installedAppsCache: CacheData; iconCache: IconCacheData }>({
      name: "installed-apps-cache",
      defaults: {
        installedAppsCache: {
          apps: [],
          lastUpdated: 0,
          platform: "",
        },
        iconCache: {
          icons: {},
          lastUpdated: 0,
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

    // Scan Windows Store / MSIX / AppX packages (Teams, Calculator, etc.)
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.IsResourcePackage -eq $false } | Select-Object Name, InstallLocation | ConvertTo-Json -Compress"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      if (stdout.trim()) {
        let entries = JSON.parse(stdout);
        if (!Array.isArray(entries)) entries = [entries];

        for (const entry of entries) {
          if (entry.Name) {
            const friendlyName = entry.Name.replace(/^.*\./, "").replace(
              /([a-z])([A-Z])/g,
              "$1 $2"
            );

            if (
              friendlyName.length > 2 &&
              !/^Windows\.|^Microsoft\.NET|^Microsoft\.VCLibs/i.test(entry.Name)
            ) {
              apps.push({
                name: friendlyName,
                normalizedName: this.normalizeAppName(friendlyName),
                path: entry.InstallLocation || undefined,
              });
            }
          }
        }
      }
    } catch (error) {
      logger.warn("Error scanning AppX packages:", error);
    }

    // Scan per-user app directories (Electron/Squirrel apps: Slack, Discord, etc.)
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      try {
        const entries = fs.readdirSync(localAppData, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const updateExe = path.join(localAppData, entry.name, "Update.exe");
          if (fs.existsSync(updateExe)) {
            const dirName = entry.name;
            const friendlyName = dirName.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ");
            apps.push({
              name: friendlyName,
              normalizedName: this.normalizeAppName(friendlyName),
              path: path.join(localAppData, entry.name),
            });
          }
        }
      } catch (error) {
        logger.warn("Error scanning LocalAppData for Squirrel apps:", error);
      }
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
   * Extract icons for a list of apps using Electron's app.getFileIcon().
   * Returns apps with iconDataUrl populated where possible.
   * Uses a separate icon cache to avoid re-extracting on every load.
   */
  async extractIcons(apps: InstalledApp[]): Promise<InstalledApp[]> {
    const { app } = await import("electron");
    const iconCache = this.store.get("iconCache");
    const now = Date.now();
    const cacheValid = now - iconCache.lastUpdated < CACHE_TTL_MS;
    const cachedIcons = cacheValid ? iconCache.icons : {};
    const newIcons: Record<string, string> = { ...cachedIcons };
    let extracted = 0;

    const results = await Promise.all(
      apps.map(async (appEntry) => {
        if (cachedIcons[appEntry.normalizedName]) {
          return { ...appEntry, iconDataUrl: cachedIcons[appEntry.normalizedName] };
        }

        const exePath = this.findExePath(appEntry);
        if (!exePath) return appEntry;

        try {
          const icon = await app.getFileIcon(path.normalize(exePath), { size: "normal" });
          const dataUrl = icon.toDataURL();
          if (dataUrl && dataUrl.length > 30) {
            newIcons[appEntry.normalizedName] = dataUrl;
            extracted++;
            return { ...appEntry, iconDataUrl: dataUrl };
          }
        } catch {
          // Silently skip — fallback to letter avatar in UI
        }
        return appEntry;
      })
    );

    if (extracted > 0 || !cacheValid) {
      this.store.set("iconCache", { icons: newIcons, lastUpdated: Date.now() });
      logger.info(`Extracted ${extracted} new icons, ${Object.keys(newIcons).length} total cached`);
    }

    return results;
  }

  /**
   * Find an actual .exe file for an app, handling Squirrel app layouts
   * where the exe lives inside app-x.y.z/ subfolder.
   */
  private findExePath(appEntry: InstalledApp): string | null {
    if (!appEntry.path) return null;

    if (process.platform === "win32") {
      // Direct .exe path (from registry — InstallLocation often has the folder)
      const dirPath = appEntry.path;

      // Check if the path itself is an exe
      if (dirPath.endsWith(".exe") && fs.existsSync(dirPath)) {
        return dirPath;
      }

      // Squirrel apps: look for app-x.y.z/*.exe inside the install dir
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        // Find the latest app-* directory
        const appDirs = entries
          .filter((e) => e.isDirectory() && e.name.startsWith("app-"))
          .map((e) => e.name)
          .sort()
          .reverse();

        if (appDirs.length > 0) {
          const latestAppDir = path.join(dirPath, appDirs[0]);
          const exes = fs.readdirSync(latestAppDir).filter((f) => f.endsWith(".exe"));
          if (exes.length > 0) {
            return path.join(latestAppDir, exes[0]);
          }
        }

        // Fallback: look for any .exe directly in the path
        const directExes = entries.filter((e) => e.isFile() && e.name.endsWith(".exe"));
        if (directExes.length > 0) {
          return path.join(dirPath, directExes[0].name);
        }
      } catch {
        // Directory not accessible
      }
    }

    return null;
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
    this.store.set("iconCache", { icons: {}, lastUpdated: 0 });
    logger.info("Cache cleared");
  }
}

// Export singleton instance
export const installedAppsService = new InstalledAppsService();
