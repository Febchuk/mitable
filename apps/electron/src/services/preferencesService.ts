/**
 * Preferences Service
 *
 * Manages user preferences using electron-store for persistent storage.
 * Preferences are stored locally on the user's machine.
 */

import Store from "electron-store";
import { createLogger } from "../lib/logger";

const logger = createLogger("Preferences");

// Preferences schema
interface PreferencesSchema {
  session: {
    hidePillOnSessionEnd: boolean;
    dontAskHidePillAgain: boolean;
    showPillOnSessionStart: boolean;
  };
  // User-scoped preferences (keyed by userId)
  users: {
    [userId: string]: {
      blockedApps: string[]; // Array of normalized app names (lowercase)
      notificationFrequencyMinutes: number; // Frequency in minutes for reminder notifications
      autoSessionStart: boolean; // Auto-start session on powerMonitor resume
    };
  };
}

// Default values
const defaults: PreferencesSchema = {
  session: {
    hidePillOnSessionEnd: false,
    dontAskHidePillAgain: false,
    showPillOnSessionStart: true,
  },
  users: {},
};

// Default blocked apps (Electron, Messages, WhatsApp)
const DEFAULT_BLOCKED_APPS = ["electron", "messages", "whatsapp"];

class PreferencesService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any;

  constructor() {
    this.store = new Store({
      name: "mitable-preferences",
      defaults,
      schema: {
        session: {
          type: "object",
          properties: {
            hidePillOnSessionEnd: { type: "boolean" },
            dontAskHidePillAgain: { type: "boolean" },
            showPillOnSessionStart: { type: "boolean" },
          },
        },
      },
    });
    logger.info(" Initialized with store path:", this.store.path);
  }

  // Session preferences
  getHidePillOnSessionEnd(): boolean {
    return this.store.get("session.hidePillOnSessionEnd") as boolean;
  }

  setHidePillOnSessionEnd(value: boolean): void {
    this.store.set("session.hidePillOnSessionEnd", value);
    logger.info(" hidePillOnSessionEnd set to:", value);
  }

  getDontAskHidePillAgain(): boolean {
    return this.store.get("session.dontAskHidePillAgain") as boolean;
  }

  setDontAskHidePillAgain(value: boolean): void {
    this.store.set("session.dontAskHidePillAgain", value);
    logger.info(" dontAskHidePillAgain set to:", value);
  }

  getShowPillOnSessionStart(): boolean {
    return this.store.get("session.showPillOnSessionStart") as boolean;
  }

  setShowPillOnSessionStart(value: boolean): void {
    this.store.set("session.showPillOnSessionStart", value);
    logger.info(" showPillOnSessionStart set to:", value);
  }

  // Generic get/set by key
  getPreference(key: string): boolean | null {
    switch (key) {
      case "hidePillOnSessionEnd":
        return this.getHidePillOnSessionEnd();
      case "dontAskHidePillAgain":
        return this.getDontAskHidePillAgain();
      case "showPillOnSessionStart":
        return this.getShowPillOnSessionStart();
      default:
        logger.warn(" Unknown preference key:", key);
        return null;
    }
  }

  setPreference(key: string, value: boolean): { success: boolean; error?: string } {
    switch (key) {
      case "hidePillOnSessionEnd":
        this.setHidePillOnSessionEnd(value);
        return { success: true };
      case "dontAskHidePillAgain":
        this.setDontAskHidePillAgain(value);
        return { success: true };
      case "showPillOnSessionStart":
        this.setShowPillOnSessionStart(value);
        return { success: true };
      default:
        logger.warn(" Unknown preference key:", key);
        return { success: false, error: "Unknown preference key" };
    }
  }

  // Bulk operations
  getAllPreferences(): PreferencesSchema {
    return this.store.store as PreferencesSchema;
  }

  resetToDefaults(): void {
    this.store.clear();
    logger.info(" Reset to defaults");
  }

  // User-scoped block list management
  getUserBlockedApps(userId: string): string[] {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return userPrefs.blockedApps || [...DEFAULT_BLOCKED_APPS];
  }

  setUserBlockedApps(userId: string, blockedApps: string[]): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      blockedApps,
    });
    logger.info(` Blocked apps for user ${userId} set to:`, blockedApps);
  }

  addUserBlockedApp(userId: string, appName: string): void {
    const normalizedAppName = appName.toLowerCase();
    const current = this.getUserBlockedApps(userId);
    if (!current.includes(normalizedAppName)) {
      this.setUserBlockedApps(userId, [...current, normalizedAppName]);
    }
  }

  removeUserBlockedApp(userId: string, appName: string): void {
    const normalizedAppName = appName.toLowerCase();
    const current = this.getUserBlockedApps(userId);
    this.setUserBlockedApps(userId, current.filter((app) => app !== normalizedAppName));
  }

  // Notification frequency preference (user-scoped)
  getUserNotificationFrequency(userId: string): number {
    const userPrefs = this.store.get(`users.${userId}`, {});
    // Default to 30 minutes if not set
    return userPrefs.notificationFrequencyMinutes ?? 30;
  }

  setUserNotificationFrequency(userId: string, minutes: number): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      notificationFrequencyMinutes: minutes,
    });
    logger.info(` Notification frequency for user ${userId} set to: ${minutes} minutes`);
  }

  // Auto session start preference (user-scoped)
  getUserAutoSessionStart(userId: string): boolean {
    const userPrefs = this.store.get(`users.${userId}`, {});
    // Default to false if not set
    return userPrefs.autoSessionStart ?? false;
  }

  setUserAutoSessionStart(userId: string, enabled: boolean): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      autoSessionStart: enabled,
    });
    logger.info(` Auto session start for user ${userId} set to: ${enabled}`);
  }
}

// Export singleton
export const preferencesService = new PreferencesService();
export type { PreferencesSchema };
