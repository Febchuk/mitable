/**
 * Migration 0029: Add ingestion_status to monitoring_sessions
 *
 * Fixes race condition where session is marked 'ready' before RAG ingestion completes.
 * Adds separate ingestion_status field to track RAG pipeline independently.
 *
 * Run with: npx tsx src/scripts/run-migration-0029.ts
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0029: Add ingestion_status to monitoring_sessions...\n");

    // 1. Add ingestion_status column
    console.log("1. Adding ingestion_status column...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS ingestion_status TEXT DEFAULT 'pending' 
      CHECK (ingestion_status IN ('pending', 'ingesting', 'completed', 'failed'))
    `);

    // 2. Backfill: sessions that are ready/ended should have completed ingestion (or are old)
    console.log("2. Backfilling ingestion_status for existing sessions...");
    await db.execute(sql`
      UPDATE monitoring_sessions
      SET ingestion_status = 'completed'
      WHERE status IN ('ready', 'ended')
      AND ingestion_status = 'pending'
    `);

    // 3. Create index for filtering by ingestion status
    console.log("3. Creating index on ingestion_status...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_ingestion_status 
      ON monitoring_sessions(ingestion_status)
    `);

    console.log("\n✅ Migration 0029 completed successfully!");
    console.log("\nChanges:");
    console.log("  • Added ingestion_status column to monitoring_sessions");
    console.log("  • Backfilled existing sessions as 'completed'");
    console.log("  • Created index idx_monitoring_sessions_ingestion_status");
    console.log("\nWhat this fixes:");
    console.log("  • Race condition: session marked 'ready' before chunks ingested");
    console.log("  • Users can now wait for ingestion_status='completed' before querying");
    console.log("\nStates:");
    console.log("  • pending: Not yet ingested");
    console.log("  • ingesting: Currently being chunked and embedded");
    console.log("  • completed: Successfully ingested to session_chunks");
    console.log("  • failed: Ingestion failed");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
