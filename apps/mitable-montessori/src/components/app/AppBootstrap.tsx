"use client";

import { useCallback, useEffect } from "react";
import { pullSyncIfStale } from "@/lib/sync/pull";
import { startSyncWorker } from "@/lib/sync/worker";
import { invalidateRosterIndex } from "@/lib/tokenize/roster-index";
import { registerServiceWorker } from "@/lib/pwa/register";
import { getDb, clearDb } from "@/lib/db/schema";

/** Recover from stale Dexie schema by deleting the local DB once. The next
 *  page load picks up the fresh schema. We only retry once per session to
 *  avoid an infinite reload loop if something else is broken. */
async function ensureFreshSchema() {
  const SENTINEL = "mitable-schema-recovered";
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SENTINEL)) return;
  try {
    // Touching `attendanceProj.where("date")` forces Dexie to validate the
    // index against the on-disk schema. If a v1 DB lingers, this throws
    // SchemaError synchronously and we recover.
    await getDb().attendanceProj.where("date").equals("__schema_check__").count();
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "SchemaError" || /KeyPath\s.*not indexed/i.test(e?.message ?? "")) {
      console.warn("Stale Dexie schema detected — clearing local DB and reloading", err);
      try {
        await clearDb();
      } catch {
        // Fall through — reload below evicts the stale connection regardless.
      }
      sessionStorage.setItem(SENTINEL, "1");
      window.location.reload();
    } else {
      throw err;
    }
  }
}

interface AppBootstrapProps {
  schoolId: string;
  userId: string;
}

export function AppBootstrap({ schoolId, userId }: AppBootstrapProps) {
  const refreshSchoolDataIfNeeded = useCallback(async () => {
    const result = await pullSyncIfStale({ schoolId, userId });
    if (result) invalidateRosterIndex();
  }, [schoolId, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureFreshSchema();
        if (cancelled) return;
        try {
          await refreshSchoolDataIfNeeded();
        } catch (err) {
          // Offline access still works from Dexie, so do not prevent the
          // command worker and service worker from starting after a failed pull.
          console.error("Initial school sync failed", err);
        }
        if (cancelled) return;
        startSyncWorker();
        registerServiceWorker();
      } catch (err) {
        console.error("App bootstrap failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSchoolDataIfNeeded]);

  // A short tab switch should be free. Once the local cache is five minutes
  // old (or the browser comes back online), refresh it in the background.
  useEffect(() => {
    let inFlight = false;
    function refreshIfNeeded() {
      if (inFlight) return;
      inFlight = true;
      refreshSchoolDataIfNeeded()
        .catch((err) => console.error("Background school sync failed", err))
        .finally(() => {
          inFlight = false;
        });
    }
    function onVisible() {
      if (document.visibilityState === "visible") refreshIfNeeded();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refreshIfNeeded);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refreshIfNeeded);
    };
  }, [refreshSchoolDataIfNeeded]);

  return null;
}
