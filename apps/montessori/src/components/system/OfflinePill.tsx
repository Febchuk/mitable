"use client";

import * as React from "react";
import { CloudOff, Loader2 } from "lucide-react";

import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { useCaptureQueueCount } from "@/lib/offline/useCaptureQueueCount";

/**
 * Floating offline indicator.
 *
 * Visibility rules:
 *   - Offline                   → "Offline" + queued count (if any).
 *   - Online with queue > 0     → "Syncing N capture(s)…" until the
 *                                 drain (6.3) clears them.
 *   - Online with empty queue   → hidden.
 *
 * Sits top-center under the browser chrome on mobile and stays
 * unobtrusive on desktop. Uses theme tokens only — no raw hex.
 */
export function OfflinePill() {
    const online = useOnlineStatus();
    const queued = useCaptureQueueCount();

    if (online && queued === 0) return null;

    const isSyncing = online && queued > 0;

    return (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2 px-3"
        >
            <div
                className={
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur " +
                    (isSyncing
                        ? "border-accent-border bg-accent-bg text-accent"
                        : "border-stroke-subtle bg-canvas-overlay text-ink-primary")
                }
            >
                {isSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <CloudOff className="h-3.5 w-3.5" />
                )}
                <span>
                    {isSyncing
                        ? `Syncing ${queued} capture${queued === 1 ? "" : "s"}…`
                        : queued > 0
                        ? `Offline · ${queued} pending`
                        : "Offline"}
                </span>
            </div>
        </div>
    );
}
