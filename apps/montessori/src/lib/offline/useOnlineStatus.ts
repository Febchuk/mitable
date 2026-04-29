"use client";

import * as React from "react";

/**
 * Reactive `navigator.onLine`. Initial render is `true` to avoid a
 * server/client mismatch flash on the first paint — we settle on the
 * real value as soon as the effect runs.
 */
export function useOnlineStatus(): boolean {
    const [online, setOnline] = React.useState<boolean>(true);

    React.useEffect(() => {
        if (typeof navigator === "undefined") return;
        setOnline(navigator.onLine);

        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, []);

    return online;
}
