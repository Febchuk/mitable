import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface DevFlags {
  newExperience: boolean; // Calendar + Recaps (true) vs Sessions-only (false)
  passiveMonitoring: boolean; // Auto-detect activity to start/end sessions
}

const STORAGE_KEY = "mitable-dev-flags";

const DEFAULT_FLAGS: DevFlags = {
  newExperience: true,
  passiveMonitoring: false,
};

function loadFlags(): DevFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FLAGS, ...parsed };
    }
  } catch {
    // ignore corrupt data
  }
  return DEFAULT_FLAGS;
}

interface DevFlagsContextValue {
  flags: DevFlags;
  setFlag: <K extends keyof DevFlags>(key: K, value: DevFlags[K]) => void;
}

const DevFlagsContext = createContext<DevFlagsContextValue | null>(null);

export function DevFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<DevFlags>(loadFlags);

  const setFlag = useCallback(<K extends keyof DevFlags>(key: K, value: DevFlags[K]) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

      // Sync passive monitoring flag to main process
      if (key === "passiveMonitoring" && window.consoleAPI?.setPassiveMonitoringEnabled) {
        window.consoleAPI.setPassiveMonitoringEnabled(value as boolean);
      }

      return next;
    });
  }, []);

  // Sync passive monitoring state on mount
  useEffect(() => {
    if (flags.passiveMonitoring && window.consoleAPI?.setPassiveMonitoringEnabled) {
      window.consoleAPI.setPassiveMonitoringEnabled(true);
    }
  }, []);

  return <DevFlagsContext.Provider value={{ flags, setFlag }}>{children}</DevFlagsContext.Provider>;
}

export function useDevFlags(): DevFlagsContextValue {
  const ctx = useContext(DevFlagsContext);
  if (!ctx) {
    throw new Error("useDevFlags must be used within a DevFlagsProvider");
  }
  return ctx;
}
