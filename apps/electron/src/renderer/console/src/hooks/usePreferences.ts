import { useState, useEffect, useCallback } from "react";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("usePreferences");

interface SessionPreferences {
  hidePillOnSessionEnd: boolean;
  dontAskHidePillAgain: boolean;
  showPillOnSessionStart: boolean;
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
        logger.error(" Failed to load:", error);
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
      logger.error(" Failed to update:", error);
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
    showPillOnSessionStart: preferences?.session.showPillOnSessionStart ?? true,
  };
}

// Summary preferences types
export interface SummaryPreferences {
  detailLevel: "concise" | "verbose";
  format: "bullets" | "paragraphs";
  includeScreenshots: boolean;
  alwaysAskOnSessionEnd: boolean;
}

/**
 * Hook for managing summary/session end preferences
 */
export function useSummaryPreferences() {
  const [summaryPrefs, setSummaryPrefs] = useState<SummaryPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load summary preferences on mount
  useEffect(() => {
    const loadSummaryPreferences = async () => {
      try {
        const prefs = await window.consoleAPI.getSummaryPreferences();
        setSummaryPrefs(prefs);
      } catch (error) {
        logger.error(" Failed to load summary preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSummaryPreferences();
  }, []);

  // Update summary preferences
  const updateSummaryPreferences = useCallback(
    async (prefs: Partial<SummaryPreferences>) => {
      try {
        const result = await window.consoleAPI.setSummaryPreferences(prefs);
        if (result.success) {
          // Reload preferences after update
          const updated = await window.consoleAPI.getSummaryPreferences();
          setSummaryPrefs(updated);
        }
        return result;
      } catch (error) {
        logger.error(" Failed to update summary preferences:", error);
        return { success: false, error: String(error) };
      }
    },
    []
  );

  // Update just the "always ask" preference
  const setAlwaysAsk = useCallback(async (value: boolean) => {
    try {
      const result = await window.consoleAPI.setAlwaysAskOnSessionEnd(value);
      if (result.success) {
        const updated = await window.consoleAPI.getSummaryPreferences();
        setSummaryPrefs(updated);
      }
      return result;
    } catch (error) {
      logger.error(" Failed to update always ask preference:", error);
      return { success: false, error: String(error) };
    }
  }, []);

  // Update default values (detail level, format, include screenshots)
  const updateDefaults = useCallback(
    async (defaults: {
      detailLevel?: "concise" | "verbose";
      format?: "bullets" | "paragraphs";
      includeScreenshots?: boolean;
    }) => {
      try {
        const result = await window.consoleAPI.setSummaryDefaults(defaults);
        if (result.success) {
          const updated = await window.consoleAPI.getSummaryPreferences();
          setSummaryPrefs(updated);
        }
        return result;
      } catch (error) {
        logger.error(" Failed to update summary defaults:", error);
        return { success: false, error: String(error) };
      }
    },
    []
  );

  return {
    summaryPrefs,
    isLoading,
    updateSummaryPreferences,
    setAlwaysAsk,
    updateDefaults,
    // Convenience getters
    detailLevel: summaryPrefs?.detailLevel ?? "concise",
    format: summaryPrefs?.format ?? "bullets",
    includeScreenshots: summaryPrefs?.includeScreenshots ?? true,
    alwaysAskOnSessionEnd: summaryPrefs?.alwaysAskOnSessionEnd ?? true,
  };
}
