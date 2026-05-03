"use client";

/**
 * Service worker + install prompt registration. Runs once at app boot, after
 * AppBootstrap has hydrated the local store. Survives hot reloads in dev by
 * skipping registration unless we're in production OR the URL has
 * `?sw=1` for manual testing.
 */

let installPrompt: BeforeInstallPromptEvent | null = null;
type Listener = (canInstall: boolean) => void;
const listeners = new Set<Listener>();

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const allow =
    process.env.NODE_ENV === "production" || new URLSearchParams(window.location.search).has("sw");
  if (!allow) return;
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("Service worker registration failed", err);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l(true));
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    listeners.forEach((l) => l(false));
  });
}

export function canInstall(): boolean {
  return !!installPrompt;
}

export function onInstallability(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!installPrompt) return "unavailable";
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  listeners.forEach((l) => l(false));
  return choice.outcome;
}
