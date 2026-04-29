"use client";

import { useEffect } from "react";

/**
 * Registers the Mitable service worker once the renderer is on the
 * client and the page has loaded enough that we're not stealing
 * bandwidth from initial paint.
 *
 * Dev caveat: in `next dev` the worker is still useful for testing
 * install + offline flows, but Next will rebuild chunks every save
 * which means the runtime cache churns. That's fine — the install
 * + manifest behaviour is what we care about validating.
 */
export function PWARegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        const register = () => {
            navigator.serviceWorker
                .register("/sw.js", { scope: "/" })
                .catch((err) => {
                    // Logged but never thrown — the app must keep
                    // working even if registration fails (e.g. on
                    // private-window iOS Safari).
                    console.warn("[PWA] service worker registration failed", err);
                });
        };

        if (document.readyState === "complete") {
            register();
        } else {
            window.addEventListener("load", register, { once: true });
        }
    }, []);

    return null;
}
