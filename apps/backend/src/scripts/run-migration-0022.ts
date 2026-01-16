/**
 * Migration 0022: Add Key Activities Table (Activity Registry)
 * Part of the Relational State-Anchor Refactor
 *
 * Run with: npm run migrate:0022
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("Starting migration 0022: Add Key Activities Table (Activity Registry)...");
    console.log("Part of the Relational State-Anchor Refactor\n");

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, "../db/migrations/0022_add_key_activities.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0022 completed successfully!");
    console.log("\nChanges applied:");
    console.log("  Tables created:");
    console.log("    - key_activities - Activity Registry (source of truth for work activities)");
    console.log("\n  Columns added to session_captures:");
    console.log("    - key_activity_id (FK) - Links capture to activity");
    console.log("    - progress - Perceiver output: IN_PROGRESS | COMPLETE | CONTEXT_SWITCH");
    console.log("    - structural_break_detected - Triggers visual anchor capture");
    console.log("    - milestone_detected - Progress checkpoint detected");
    console.log("    - milestone_description - What milestone was reached");
    console.log("    - milestone_confidence - high | medium | low");
    console.log("    - milestone_inferred_from - state_transition | cumulative_pattern | content_change");
    console.log("    - evidence_reference - Visual evidence for progress determination");
    console.log("\n  Indexes created:");
    console.log("    - idx_key_activities_session");
    console.log("    - idx_key_activities_status");
    console.log("    - idx_captures_key_activity");
    console.log("    - idx_captures_milestone");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
