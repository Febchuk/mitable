/* eslint-disable no-restricted-globals */
/**
 * Mitable service worker — minimal app-shell offline support.
 *
 * Strategy:
 *   - HTML / app-shell:   network-first, fall back to cached shell
 *   - same-origin static: cache-first (icons, manifest, JS chunks)
 *   - API:                network-only (we never want stale auth/data)
 *
 * Whisper / Tesseract model assets are fetched from the CDN and cached in the
 * browser's HTTP cache by the worker thread; we deliberately don't intercept
 * those here so we don't double-cache 75-150MB of weights.
 */

const VERSION = "v1";
const SHELL_CACHE = `mitable-shell-${VERSION}`;
const STATIC_CACHE = `mitable-static-${VERSION}`;
const SHELL_URLS = ["/", "/app/today", "/manifest.webmanifest", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API; always go to network.
  if (url.pathname.startsWith("/api/")) return;

  // HTML navigations: network-first, fall back to cached shell or /offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match("/offline")) ||
            new Response("Offline", { status: 503 })
          );
        }
      })()
    );
    return;
  }

  // Same-origin static assets: cache-first.
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
