/**
 * Migration 0028: Add user_id to session_chunks for efficient user filtering
 *
 * Adds denormalized user_id column to avoid JOIN with monitoring_sessions
 * for RAG queries. Improves document generation performance.
 *
 * Run with: npx tsx src/scripts/run-migration-0028.ts
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0028: Add user_id to session_chunks...\n");

    // 1. Add user_id column
    console.log("1. Adding user_id column to session_chunks...");
    await db.execute(sql`
      ALTER TABLE session_chunks 
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)
    `);

    // 2. Backfill existing records by joining to monitoring_sessions
    console.log("2. Backfilling user_id from monitoring_sessions...");
    await db.execute(sql`
      UPDATE session_chunks sc
      SET user_id = ms.user_id
      FROM monitoring_sessions ms
      WHERE sc.session_id = ms.id
      AND sc.user_id IS NULL
    `);

    // 3. Make it NOT NULL after backfill
    console.log("3. Setting user_id to NOT NULL...");
    await db.execute(sql`
      ALTER TABLE session_chunks 
      ALTER COLUMN user_id SET NOT NULL
    `);

    // 4. Create index for efficient user-based queries
    console.log("4. Creating index on user_id...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_chunks_user_id ON session_chunks(user_id)
    `);

    console.log("\n✅ Migration 0028 completed successfully!");
    console.log("\nChanges:");
    console.log("  • Added user_id column to session_chunks");
    console.log("  • Backfilled user_id from monitoring_sessions");
    console.log("  • Created index idx_session_chunks_user_id");
    console.log("\nWhat this enables:");
    console.log("  • Direct user filtering without JOIN (faster RAG queries)");
    console.log("  • Improved document generation performance");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
