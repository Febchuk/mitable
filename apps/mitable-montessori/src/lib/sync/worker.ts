"use client";

import { getDb } from "@/lib/db/schema";

/**
 * Background worker that drains commands where syncedAt is null. Runs in the
 * tab (no SharedWorker — Phase 1 keeps things simple). Triggered:
 *   - on app load (startSyncWorker)
 *   - when applyApprovedToolCall calls notifySyncWorker()
 *   - on `online` event
 */

let running = false;
let kicked = false;
let backoffMs = 1000;
const MAX_BACKOFF = 30_000;

export function startSyncWorker() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => kick());
  kick();
}

export function notifySyncWorker() {
  kick();
}

function kick() {
  if (running) {
    kicked = true;
    return;
  }
  void runDrainLoop();
}

async function runDrainLoop() {
  if (typeof window === "undefined") return;
  running = true;
  try {
    let keepGoing = true;
    while (keepGoing) {
      kicked = false;
      const drained = await drainOnce();
      if (drained === 0 && !kicked) {
        keepGoing = false;
      }
      // otherwise loop: either drained > 0 (more pending) or kicked (new commands queued mid-flight)
    }
    backoffMs = 1000;
  } catch (err) {
    console.error("Sync drain failed", err);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
    setTimeout(() => kick(), backoffMs);
  } finally {
    running = false;
  }
}

interface OutboundCommand {
  client_id: string;
  classroom_id: string;
  source: "voice" | "photo" | "text";
  raw_transcript: string | null;
  command_type: "attendance" | "progress" | "note";
  payload: Record<string, unknown>;
  created_at: string;
  approved_at: string;
}

async function drainOnce(): Promise<number> {
  const db = getDb();
  // Dexie cannot index null directly; filter post-fetch instead.
  const all = await db.commands.where("status").equals("approved").toArray();
  const pending = all.filter((c) => !c.syncedAt).slice(0, 20);
  if (pending.length === 0) return 0;

  const body = {
    commands: pending.map<OutboundCommand>((c) => ({
      client_id: c.clientId,
      classroom_id: c.classroomId,
      source: c.source,
      raw_transcript: c.rawTranscript,
      command_type: c.commandType,
      payload: c.payload as unknown as Record<string, unknown>,
      created_at: c.createdAt,
      approved_at: c.approvedAt ?? c.createdAt,
    })),
  };

  const res = await fetch("/api/v1/sync/commands", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Sync failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { synced: string[] };
  if (Array.isArray(json.synced) && json.synced.length > 0) {
    const now = new Date().toISOString();
    await db.transaction("rw", db.commands, async () => {
      for (const cid of json.synced) {
        const row = await db.commands.where("clientId").equals(cid).first();
        if (row) await db.commands.update(row.id, { syncedAt: now });
      }
    });
  }
  return pending.length;
}

export async function pendingSyncCount(): Promise<number> {
  const db = getDb();
  const all = await db.commands.where("status").equals("approved").toArray();
  return all.filter((c) => !c.syncedAt).length;
}
