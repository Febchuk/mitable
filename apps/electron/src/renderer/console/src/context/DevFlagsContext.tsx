import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface DevFlags {
  newExperience: boolean; // Calendar + Recaps (true) vs Sessions-only (false)
}

const STORAGE_KEY = "mitable-dev-flags";

const DEFAULT_FLAGS: DevFlags = {
  newExperience: true,
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

      return next;
    });
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
