"use client";

import { useEffect } from "react";
import { pullSync } from "@/lib/sync/pull";
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

export function AppBootstrap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureFreshSchema();
        if (cancelled) return;
        await pullSync();
        if (cancelled) return;
        invalidateRosterIndex();
        startSyncWorker();
        registerServiceWorker();
      } catch (err) {
        console.error("App bootstrap failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-pull when the tab becomes visible after being hidden — keeps Dexie
  // reads fresh after the user switches tabs without forcing a hard reload.
  useEffect(() => {
    let inFlight = false;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      pullSync()
        .then(() => invalidateRosterIndex())
        .catch((err) => console.error("Visibility re-sync failed", err))
        .finally(() => {
          inFlight = false;
        });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
