"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * One QueryClient per browser session. We don't use Suspense for now
 * — all hooks return loading + error states the UI can render
 * inline, which is friendlier in long-lived pages like the grid.
 */
function makeClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Most reads are personal-classroom scale (≤500 rows). A
                // 30s stale window is plenty fresh for the demo and saves
                // a refetch on every tab focus.
                staleTime: 30_000,
                refetchOnWindowFocus: false,
                retry: (failureCount, error) => {
                    // Don't retry on auth errors — apiRequest already did
                    // a single refresh attempt. Anything else gets one
                    // retry to ride out transient network blips.
                    const status = (error as { status?: number })?.status;
                    if (status === 401 || status === 403 || status === 404) return false;
                    return failureCount < 1;
                },
            },
        },
    });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = React.useState(() => makeClient());
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
