import { useState, useEffect, useCallback } from "react";

interface SessionPreferences {
  hidePillOnSessionEnd: boolean;
  dontAskHidePillAgain: boolean;
}

interface Preferences {
  session: SessionPreferences;
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await window.consoleAPI.getAllPreferences();
        setPreferences(prefs);
      } catch (error) {
        console.error("[usePreferences] Failed to load:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, []);

  // Update a specific preference
  const updatePreference = useCallback(async (key: string, value: boolean) => {
    try {
      const result = await window.consoleAPI.setPreference(key, value);
      if (result.success) {
        // Reload preferences after update
        const prefs = await window.consoleAPI.getAllPreferences();
        setPreferences(prefs);
      }
      return result;
    } catch (error) {
      console.error("[usePreferences] Failed to update:", error);
      return { success: false, error: String(error) };
    }
  }, []);

  return {
    preferences,
    isLoading,
    updatePreference,
    // Convenience getters
    hidePillOnSessionEnd: preferences?.session.hidePillOnSessionEnd ?? false,
    dontAskHidePillAgain: preferences?.session.dontAskHidePillAgain ?? false,
  };
}
