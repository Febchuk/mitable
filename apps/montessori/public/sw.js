/* Mitable for Montessori — service worker.
 *
 * Goals:
 *   1. Make the app installable + give it an "open from home screen"
 *      shell that loads instantly.
 *   2. Provide a minimal offline fallback for navigation requests
 *      so the PWA doesn't die when a teacher loses signal mid-day.
 *   3. NEVER cache /api/* or auth flows — those must always hit
 *      the network. The agent + write paths rely on live calls and
 *      stale auth tokens are worse than a clear failure.
 *
 * The full offline capture queue lives in the renderer (IndexedDB)
 * — see 6.2. This worker only owns the shell + offline fallback.
 */

const VERSION = "v1";
const SHELL_CACHE = `mitable-shell-${VERSION}`;
const RUNTIME_CACHE = `mitable-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const SHELL_ASSETS = [OFFLINE_URL, "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(SHELL_CACHE);
            // Best-effort: missing assets in dev shouldn't block install.
            await Promise.all(
                SHELL_ASSETS.map((url) =>
                    cache.add(url).catch(() => {
                        /* ignore individual misses */
                    })
                )
            );
            self.skipWaiting();
        })()
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            // Drop old versions so a redeploy retires the previous
            // shell instead of leaving stale chunks alive.
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
                    .map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Never intercept API or auth callback traffic. Live network
    // only — see header comment.
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(handleNavigation(request));
        return;
    }

    // Static assets: cache-first with a network refresh.
    if (
        url.pathname.startsWith("/_next/static/") ||
        /\.(?:js|css|woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname)
    ) {
        event.respondWith(cacheFirst(request));
    }
});

async function handleNavigation(request) {
    try {
        const fresh = await fetch(request);
        // Cache the latest navigation HTML so a subsequent offline
        // visit can fall back to it before the static offline page.
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
    } catch {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response("Offline", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
        });
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) {
        // Refresh in the background so the next load gets the
        // freshest asset without blocking the current one.
        fetch(request)
            .then((res) => {
                if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
            })
            .catch(() => {});
        return cached;
    }
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
    } catch {
        return new Response("", { status: 504 });
    }
}
