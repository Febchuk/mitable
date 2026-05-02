"use client";

import { useEffect } from "react";
import { pullSync } from "@/lib/sync/pull";
import { startSyncWorker } from "@/lib/sync/worker";
import { invalidateRosterIndex } from "@/lib/tokenize/roster-index";

export function AppBootstrap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await pullSync();
        if (cancelled) return;
        invalidateRosterIndex();
        startSyncWorker();
      } catch (err) {
        console.error("App bootstrap failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
