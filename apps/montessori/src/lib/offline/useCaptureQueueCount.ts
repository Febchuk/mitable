"use client";

import * as React from "react";

import { countCaptures, subscribeToQueueChanges } from "./captureQueue";

/**
 * Reactive count of pending offline captures. Refreshes whenever
 * the queue notifies a change (enqueue / remove / clear). Returns
 * 0 during SSR and before IDB has had a chance to respond.
 */
export function useCaptureQueueCount(): number {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        const refresh = () => {
            countCaptures()
                .then((c) => {
                    if (!cancelled) setCount(c);
                })
                .catch(() => {
                    if (!cancelled) setCount(0);
                });
        };

        refresh();
        const unsubscribe = subscribeToQueueChanges(refresh);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    return count;
}
