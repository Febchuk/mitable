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

  if (!allow) {
    // Dev mode: proactively evict any service worker + cache left over from a
    // previous production build or `?sw=1` test. Without this, stale SWs keep
    // intercepting requests for `_next/static/chunks/...` and serving the
    // wrong MIME type, which surfaces as the "Refused to execute script"
    // errors in the console.
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => {
        if (typeof caches === "undefined") return;
        return caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      })
      .catch(() => {
        // Non-fatal — leftover SW just won't get cleared this session.
      });
    return;
  }

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
