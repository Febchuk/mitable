/**
 * Preferences Service
 *
 * Manages user preferences using electron-store for persistent storage.
 * Preferences are stored locally on the user's machine.
 */

import Store from "electron-store";
import { createLogger } from "../lib/logger";

const logger = createLogger("Preferences");

// Summary preference types
type SummaryDetailLevel = "concise" | "verbose";
type SummaryFormat = "bullets" | "paragraphs";

interface SummaryPreferences {
  detailLevel: SummaryDetailLevel;
  format: SummaryFormat;
  includeScreenshots: boolean;
  alwaysAskOnSessionEnd: boolean; // When true, show dialog; when false, use defaults
}

interface AudioPreferences {
  microphoneDeviceId: string | null; // null = default device
  systemAudioEnabled: boolean;
  systemAudioOutputId: string | null; // null = default output device
}

interface NotificationPreferences {
  updateNotifications: boolean;
  sessionNotifications: boolean;
  nudgeNotifications: boolean;
}

// Preferences schema
interface PreferencesSchema {
  session: {
    hidePillOnSessionEnd: boolean;
    dontAskHidePillAgain: boolean;
    showPillOnSessionStart: boolean;
  };
  summary: SummaryPreferences;
  audio: AudioPreferences;
  // User-scoped preferences (keyed by userId)
  users: {
    [userId: string]: {
      blockedApps: string[]; // Array of normalized app names (lowercase)
      notificationFrequencyMinutes: number; // Frequency in minutes for reminder notifications
      autoSessionStart: boolean; // Auto-start session on powerMonitor resume
      autoRecap: boolean; // Auto-create recap after session ends
      passiveMonitoringEnabled: boolean; // Auto-detect activity and start/stop sessions
      onboardingVersion: number; // Version of onboarding the user has completed (0 = never)
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
  summary: {
    detailLevel: "concise",
    format: "bullets",
    includeScreenshots: true,
    alwaysAskOnSessionEnd: true, // Default to asking for preferences
  },
  audio: {
    microphoneDeviceId: null, // null = use system default
    systemAudioEnabled: true, // Default to capturing system audio
    systemAudioOutputId: null, // null = use system default output
  },
  users: {},
};

const DEFAULT_BLOCKED_APPS = ["electron", "messages", "whatsapp", "spotify", "imessage"];

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
        summary: {
          type: "object",
          properties: {
            detailLevel: { type: "string", enum: ["concise", "verbose"] },
            format: { type: "string", enum: ["bullets", "paragraphs"] },
            includeScreenshots: { type: "boolean" },
            alwaysAskOnSessionEnd: { type: "boolean" },
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
    this.setUserBlockedApps(
      userId,
      current.filter((app) => app !== normalizedAppName)
    );
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

  // Auto recap preference (user-scoped)
  getUserAutoRecap(userId: string): boolean {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return userPrefs.autoRecap ?? false;
  }

  setUserAutoRecap(userId: string, enabled: boolean): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      autoRecap: enabled,
    });
    logger.info(` Auto recap for user ${userId} set to: ${enabled}`);
  }

  // Passive monitoring preference (user-scoped)
  getUserPassiveMonitoringEnabled(userId: string): boolean {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return userPrefs.passiveMonitoringEnabled ?? false;
  }

  setUserPassiveMonitoringEnabled(userId: string, enabled: boolean): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      passiveMonitoringEnabled: enabled,
    });
    logger.info(` Passive monitoring for user ${userId} set to: ${enabled}`);
  }

  // Onboarding version preference (user-scoped)
  getUserOnboardingVersion(userId: string): number {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return userPrefs.onboardingVersion ?? 0;
  }

  setUserOnboardingVersion(userId: string, version: number): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      onboardingVersion: version,
    });
    logger.info(` Onboarding version for user ${userId} set to: ${version}`);
  }

  // Agent feature toggle (user-scoped, default OFF)
  getUserAgentEnabled(userId: string): boolean {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return userPrefs.agentEnabled ?? false;
  }

  setUserAgentEnabled(userId: string, enabled: boolean): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      agentEnabled: enabled,
    });
    logger.info(` Agent enabled for user ${userId} set to: ${enabled}`);
  }

  // Summary preferences
  getSummaryPreferences(): SummaryPreferences {
    return (
      (this.store.get("summary") as SummaryPreferences) ?? {
        detailLevel: "concise",
        format: "bullets",
        includeScreenshots: true,
        alwaysAskOnSessionEnd: true,
      }
    );
  }

  setSummaryPreferences(prefs: Partial<SummaryPreferences>): { success: boolean } {
    const current = this.getSummaryPreferences();
    this.store.set("summary", { ...current, ...prefs });
    logger.info(" Summary preferences updated:", prefs);
    return { success: true };
  }

  getSummaryDefaults(): Omit<SummaryPreferences, "alwaysAskOnSessionEnd"> {
    const prefs = this.getSummaryPreferences();
    return {
      detailLevel: prefs.detailLevel,
      format: prefs.format,
      includeScreenshots: prefs.includeScreenshots,
    };
  }

  setSummaryDefaults(defaults: {
    detailLevel?: SummaryDetailLevel;
    format?: SummaryFormat;
    includeScreenshots?: boolean;
  }): { success: boolean } {
    return this.setSummaryPreferences(defaults);
  }

  getAlwaysAskOnSessionEnd(): boolean {
    return this.getSummaryPreferences().alwaysAskOnSessionEnd;
  }

  setAlwaysAskOnSessionEnd(value: boolean): { success: boolean } {
    return this.setSummaryPreferences({ alwaysAskOnSessionEnd: value });
  }

  // Theme / appearance preference
  getTheme(): "dark" | "light" | "system" {
    return (this.store.get("appearance.theme") as "dark" | "light" | "system") ?? "dark";
  }

  setTheme(theme: "dark" | "light" | "system"): void {
    this.store.set("appearance.theme", theme);
    logger.info(` Theme set to: ${theme}`);
  }

  // Pill display mode preference (user-scoped)
  getUserPillDisplayMode(userId: string): "compact" | "expanded" {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return userPrefs.pillDisplayMode ?? "compact";
  }

  setUserPillDisplayMode(userId: string, mode: "compact" | "expanded"): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      pillDisplayMode: mode,
    });
    logger.info(` Pill display mode for user ${userId} set to: ${mode}`);
  }

  // Notification preferences (user-scoped)
  getUserNotificationPreferences(userId: string): NotificationPreferences {
    const userPrefs = this.store.get(`users.${userId}`, {});
    return {
      updateNotifications: userPrefs.updateNotifications ?? true,
      sessionNotifications: userPrefs.sessionNotifications ?? true,
      nudgeNotifications: userPrefs.nudgeNotifications ?? true,
    };
  }

  setUserNotificationPreferences(userId: string, prefs: Partial<NotificationPreferences>): void {
    const userPrefs = this.store.get(`users.${userId}`, {});
    this.store.set(`users.${userId}`, {
      ...userPrefs,
      ...prefs,
    });
    logger.info(` Notification preferences for user ${userId} updated:`, prefs);
  }

  // Audio preferences
  getAudioPreferences(): AudioPreferences {
    return (
      (this.store.get("audio") as AudioPreferences) ?? {
        microphoneDeviceId: null,
        systemAudioEnabled: true,
      }
    );
  }

  setAudioPreferences(prefs: Partial<AudioPreferences>): { success: boolean } {
    const current = this.getAudioPreferences();
    this.store.set("audio", { ...current, ...prefs });
    logger.info("🎤 Audio preferences updated:", prefs);
    return { success: true };
  }
}

// Export singleton
export const preferencesService = new PreferencesService();
export type {
  PreferencesSchema,
  SummaryPreferences,
  SummaryDetailLevel,
  SummaryFormat,
  AudioPreferences,
  NotificationPreferences,
};
