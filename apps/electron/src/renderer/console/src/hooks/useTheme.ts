import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    if (!window.consoleAPI?.getTheme) return;

    window.consoleAPI.getTheme().then((stored) => {
      setThemeState(stored);
      const r = resolveTheme(stored);
      setResolved(r);
      applyTheme(r);
    });

    const unsubscribe = window.consoleAPI.onThemeChanged?.((newTheme) => {
      setThemeState(newTheme);
      const r = resolveTheme(newTheme);
      setResolved(r);
      applyTheme(r);
    });

    return () => unsubscribe?.();
  }, []);

  // Track OS preference changes when using "system"
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = resolveTheme("system");
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    const r = resolveTheme(newTheme);
    setResolved(r);
    applyTheme(r);
    await window.consoleAPI?.setTheme(newTheme);
  }, []);

  return { theme, resolved, setTheme };
}
