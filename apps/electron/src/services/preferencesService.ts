/**
 * Preferences Service
 *
 * Manages user preferences using electron-store for persistent storage.
 * Preferences are stored locally on the user's machine.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store").default;

// Preferences schema
interface PreferencesSchema {
  session: {
    hidePillOnSessionEnd: boolean;
    dontAskHidePillAgain: boolean;
  };
}

// Default values
const defaults: PreferencesSchema = {
  session: {
    hidePillOnSessionEnd: false,
    dontAskHidePillAgain: false,
  },
};

class PreferencesService {
  private store: Store<PreferencesSchema>;

  constructor() {
    this.store = new Store<PreferencesSchema>({
      name: "mitable-preferences",
      defaults,
      schema: {
        session: {
          type: "object",
          properties: {
            hidePillOnSessionEnd: { type: "boolean" },
            dontAskHidePillAgain: { type: "boolean" },
          },
        },
      },
    });

    console.log("[PreferencesService] Initialized with store path:", this.store.path);
  }

  // Session preferences
  getHidePillOnSessionEnd(): boolean {
    return this.store.get("session.hidePillOnSessionEnd");
  }

  setHidePillOnSessionEnd(value: boolean): void {
    this.store.set("session.hidePillOnSessionEnd", value);
    console.log("[PreferencesService] hidePillOnSessionEnd set to:", value);
  }

  getDontAskHidePillAgain(): boolean {
    return this.store.get("session.dontAskHidePillAgain");
  }

  setDontAskHidePillAgain(value: boolean): void {
    this.store.set("session.dontAskHidePillAgain", value);
    console.log("[PreferencesService] dontAskHidePillAgain set to:", value);
  }

  // Generic get/set by key
  getPreference(key: string): boolean | null {
    switch (key) {
      case "hidePillOnSessionEnd":
        return this.getHidePillOnSessionEnd();
      case "dontAskHidePillAgain":
        return this.getDontAskHidePillAgain();
      default:
        console.warn("[PreferencesService] Unknown preference key:", key);
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
      default:
        console.warn("[PreferencesService] Unknown preference key:", key);
        return { success: false, error: "Unknown preference key" };
    }
  }

  // Bulk operations
  getAllPreferences(): PreferencesSchema {
    return this.store.store;
  }

  resetToDefaults(): void {
    this.store.clear();
    console.log("[PreferencesService] Reset to defaults");
  }
}

// Export singleton
export const preferencesService = new PreferencesService();
export type { PreferencesSchema };
