/**
 * Migration 0018: Fix frame analysis column types for session_captures
 *
 * Fixes column types for Sessions Architecture v2:
 * - delta_changed: integer -> boolean
 * - on_task: integer -> boolean
 * - importance_score: numeric -> real
 *
 * Run with: npm run migrate:0018
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0018: Fix frame analysis column types...\n");

    // 1. Add session_goal to monitoring_sessions if not exists
    console.log("1. Checking session_goal on monitoring_sessions...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS session_goal TEXT
    `);

    // 2. Fix delta_changed column type (integer -> boolean)
    console.log("2. Fixing delta_changed column type (integer -> boolean)...");
    await db.execute(sql`
      ALTER TABLE session_captures
      ALTER COLUMN delta_changed TYPE BOOLEAN
      USING CASE WHEN delta_changed = 1 THEN TRUE ELSE FALSE END
    `);
    await db.execute(sql`
      ALTER TABLE session_captures
      ALTER COLUMN delta_changed SET DEFAULT FALSE
    `);

    // 3. Fix on_task column type (integer -> boolean)
    console.log("3. Fixing on_task column type (integer -> boolean)...");
    await db.execute(sql`
      ALTER TABLE session_captures
      ALTER COLUMN on_task TYPE BOOLEAN
      USING CASE WHEN on_task = 1 THEN TRUE ELSE TRUE END
    `);
    await db.execute(sql`
      ALTER TABLE session_captures
      ALTER COLUMN on_task SET DEFAULT TRUE
    `);

    // 4. Fix importance_score column type (numeric -> real)
    console.log("4. Fixing importance_score column type (numeric -> real)...");
    await db.execute(sql`
      ALTER TABLE session_captures
      ALTER COLUMN importance_score TYPE REAL
      USING COALESCE(importance_score, 0)::REAL
    `);
    await db.execute(sql`
      ALTER TABLE session_captures
      ALTER COLUMN importance_score SET DEFAULT 0
    `);

    // 5. Drop existing indexes if any (to recreate with correct definition)
    console.log("5. Dropping any existing partial indexes...");
    try {
      await db.execute(sql`DROP INDEX IF EXISTS idx_captures_importance`);
      await db.execute(sql`DROP INDEX IF EXISTS idx_captures_on_task`);
      await db.execute(sql`DROP INDEX IF EXISTS idx_captures_delta`);
    } catch (e) {
      // Indexes might not exist, that's fine
    }

    // 6. Create indexes for common queries
    console.log("6. Creating indexes...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_captures_importance
      ON session_captures(session_id, importance_score DESC)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_captures_on_task
      ON session_captures(session_id, on_task)
      WHERE on_task = TRUE
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_captures_delta
      ON session_captures(session_id, delta_changed)
      WHERE delta_changed = TRUE
    `);

    // 7. Add column comments
    console.log("7. Adding column comments...");
    await db.execute(sql`
      COMMENT ON COLUMN monitoring_sessions.session_goal IS 'Optional user-provided goal for improved on_task detection'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.delta_changed IS 'Whether content changed from previous frame'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.delta_change_type IS 'Type: content_edit, navigation, scroll, file_switch, focus_change, none'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.delta_user_action IS 'Action: typing, clicking, scrolling, viewing, unknown'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.on_task IS 'Whether this frame is related to the session goal'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.importance_score IS '0-1 score for Top-K selection (higher = more important)'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.selected_for_export IS 'TRUE if selected for cloud upload (Top-K)'
    `);

    console.log("\n✅ Migration 0018 completed successfully!");
    console.log("\nColumn types fixed:");
    console.log("  • delta_changed: integer → boolean");
    console.log("  • on_task: integer → boolean");
    console.log("  • importance_score: numeric → real");
    console.log("\nIndexes created:");
    console.log("  • idx_captures_importance");
    console.log("  • idx_captures_on_task (partial)");
    console.log("  • idx_captures_delta (partial)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
