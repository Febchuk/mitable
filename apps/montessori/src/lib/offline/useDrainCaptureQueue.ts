"use client";

import * as React from "react";

import {
    listCaptures,
    removeCapture,
    subscribeToQueueChanges,
    type QueuedCapture,
} from "./captureQueue";
import type {
    InterpretCaptureInput,
    InterpretCaptureResult,
} from "@/lib/query/montessoriMutations";

export interface DrainItemSuccess {
    capture: QueuedCapture;
    result: InterpretCaptureResult;
}

export interface UseDrainCaptureQueueOptions {
    /**
     * Calls /agent/interpret. Pass the `mutateAsync` from
     * `useInterpretCapture` so React Query owns the lifecycle.
     */
    interpret: (input: InterpretCaptureInput) => Promise<InterpretCaptureResult>;
    /**
     * Fired once per drained capture. The consumer should render the
     * resulting envelope as a draft for the user to review — never
     * auto-save. (Spec from product.)
     */
    onItemInterpreted: (item: DrainItemSuccess) => void;
    /** Optional fault hook so the consumer can surface a soft error. */
    onItemFailed?: (capture: QueuedCapture, error: Error) => void;
}

/**
 * Drains the offline capture queue serially when the browser is
 * online. Auto-runs:
 *   - On mount (handles the case where the user reopens the app
 *     after capturing offline).
 *   - On the window `online` event (offline → online flip).
 *   - When the queue itself notifies a change while we're online and
 *     idle (e.g. another tab pushed a new item).
 *
 * Failure handling: any error stops the current pass with the
 * failing item left in the queue. A future online flip or mount
 * will retry. Network errors are common reasons; surfacing a hard
 * error to the user from here would just be noise.
 */
export function useDrainCaptureQueue({
    interpret,
    onItemInterpreted,
    onItemFailed,
}: UseDrainCaptureQueueOptions): { isDraining: boolean; drainNow: () => void } {
    const [isDraining, setIsDraining] = React.useState(false);

    // Hold the latest callbacks in refs so the drain loop never
    // closes over stale versions and we don't have to re-create the
    // loop on every render.
    const interpretRef = React.useRef(interpret);
    const onSuccessRef = React.useRef(onItemInterpreted);
    const onFailRef = React.useRef(onItemFailed);
    interpretRef.current = interpret;
    onSuccessRef.current = onItemInterpreted;
    onFailRef.current = onItemFailed;

    // Reentrancy guard. State updates are async, so a second `online`
    // event arriving in the same tick could otherwise kick off a
    // parallel drain.
    const drainingRef = React.useRef(false);

    const drain = React.useCallback(async () => {
        if (drainingRef.current) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        drainingRef.current = true;
        setIsDraining(true);
        try {
            // Pull a fresh list each loop turn — items may have been
            // added or removed by other tabs while we were processing.
            // We only walk forward; on any failure we stop so retries
            // happen in fifo order.
            // eslint-disable-next-line no-constant-condition
            while (true) {
                if (typeof navigator !== "undefined" && !navigator.onLine) break;
                const items = await listCaptures();
                const next = items[0];
                if (!next) break;

                try {
                    const result = await interpretRef.current({
                        threadId: next.threadId ?? undefined,
                        text: next.text ?? null,
                        photo: next.photo,
                        audio: next.audio,
                    });
                    await removeCapture(next.id);
                    try {
                        onSuccessRef.current({ capture: next, result });
                    } catch {
                        // Consumer-side errors must not stall the
                        // queue. Drain keeps going.
                    }
                } catch (err) {
                    onFailRef.current?.(next, err as Error);
                    break;
                }
            }
        } finally {
            drainingRef.current = false;
            setIsDraining(false);
        }
    }, []);

    // Auto-trigger: mount + online + queue-changed.
    React.useEffect(() => {
        if (typeof window === "undefined") return;

        const tryDrain = () => {
            void drain();
        };

        // Initial pass on mount.
        tryDrain();

        const onOnline = () => tryDrain();
        window.addEventListener("online", onOnline);

        const unsubscribe = subscribeToQueueChanges(() => {
            // Only react to upstream changes when we're idle — a
            // change emitted by our own removeCapture call inside the
            // loop would otherwise fire a redundant drain.
            if (!drainingRef.current) tryDrain();
        });

        return () => {
            window.removeEventListener("online", onOnline);
            unsubscribe();
        };
    }, [drain]);

    return { isDraining, drainNow: () => void drain() };
}
