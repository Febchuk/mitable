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
}

// Default values
const defaults: PreferencesSchema = {
  session: {
    hidePillOnSessionEnd: false,
    dontAskHidePillAgain: false,
    showPillOnSessionStart: true,
  },
};

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
}

// Export singleton
export const preferencesService = new PreferencesService();
export type { PreferencesSchema };
