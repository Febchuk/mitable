"use client";

import { useEffect, useState } from "react";

/**
 * Persists a small string state to localStorage. Returns [value, setValue].
 * SSR-safe: starts with `initial`, hydrates from storage in an effect after
 * mount so the server and first client render agree.
 */
export function useLocalStorageString<T extends string>(
  key: string,
  initial: T,
  isValid: (raw: string) => raw is T
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw && isValid(raw)) setValue(raw);
    } catch {
      // localStorage can throw in private mode / blocked storage; we just
      // fall back to the in-memory initial value.
    }
  }, [key, isValid]);
  const update = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Ignore write failures — UI still works, just no persistence.
    }
  };
  return [value, update];
}
