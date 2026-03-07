/**
 * Creates graph sync tables if they don't exist.
 * Run: npx tsx src/scripts/create-graph-tables.ts (from apps/backend)
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";

async function run() {
  console.log("Checking graph tables...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS graph_sync_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      success BOOLEAN NOT NULL DEFAULT false,
      synced_users INTEGER NOT NULL DEFAULT 0,
      synced_workstreams INTEGER NOT NULL DEFAULT 0,
      synced_preferences INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log("  graph_sync_runs: OK");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS graph_sync_watermarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL UNIQUE,
      watermark_ts TIMESTAMPTZ,
      watermark_value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log("  graph_sync_watermarks: OK");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workflow_visibility_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      user_id UUID,
      window TEXT NOT NULL,
      snapshot_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log("  workflow_visibility_snapshots: OK");

  console.log("\nAll graph tables ready.");
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
