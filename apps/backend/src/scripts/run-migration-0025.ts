/**
 * Migration 0025: Add classifier_data column to session_captures
 *
 * Adds JSONB column to store full Classifier RLM output:
 * - events (semantic actions with verb/object/via)
 * - entities (people, systems mentioned)
 * - metrics (exact counts for messages, links, pastes)
 * - actionType (VIEWING, NAVIGATION, PASTING, AUTHORING, EDITING, READING)
 *
 * This enables Storyteller to build semantic narratives with causal connections.
 *
 * Run with: npm run migrate:0025
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0025: Add classifier_data to session_captures...\n");

    // 1. Add classifier_data column
    console.log("1. Adding classifier_data JSONB column...");
    await db.execute(sql`
      ALTER TABLE session_captures
      ADD COLUMN IF NOT EXISTS classifier_data JSONB
    `);

    // 2. Add column comment
    console.log("2. Adding column documentation...");
    await db.execute(sql`
      COMMENT ON COLUMN session_captures.classifier_data IS 'Full Classifier RLM output: events, entities, metrics, actionType for semantic narrative building'
    `);

    // 3. Create GIN index for JSONB queries
    console.log("3. Creating GIN index for classifier_data...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_captures_classifier_data
      ON session_captures USING GIN (classifier_data)
      WHERE classifier_data IS NOT NULL
    `);

    console.log("\n✅ Migration 0025 completed successfully!");
    console.log("\nChanges:");
    console.log("  • Added classifier_data JSONB column");
    console.log("  • Created GIN index for JSONB queries");
    console.log("\nWhat this enables:");
    console.log("  • Classifier RLM stores structured output (events, entities, metrics)");
    console.log("  • Storyteller uses semantic context for causal narratives");
    console.log("  • No more 'edited content' - now 'drafted message to Olu about YC jobs'");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
