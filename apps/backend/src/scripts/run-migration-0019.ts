/**
 * Migration 0019: Add session goal context columns
 *
 * Adds columns for Linear issue integration and RAG-retrieved context:
 * - linear_issue_id: Linear issue identifier
 * - linear_issue_title: Title of linked issue
 * - linear_issue_description: Full issue description
 * - additional_context: User's free-text context
 * - related_docs_context: RAG-retrieved docs at session start
 *
 * Run with: npm run migrate:0019
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0019: Add session goal context columns...\n");

    // 1. Add linear_issue_id column
    console.log("1. Adding linear_issue_id column...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS linear_issue_id VARCHAR(100)
    `);

    // 2. Add linear_issue_title column
    console.log("2. Adding linear_issue_title column...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS linear_issue_title TEXT
    `);

    // 3. Add linear_issue_description column
    console.log("3. Adding linear_issue_description column...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS linear_issue_description TEXT
    `);

    // 4. Add additional_context column
    console.log("4. Adding additional_context column...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS additional_context TEXT
    `);

    // 5. Add related_docs_context column
    console.log("5. Adding related_docs_context column...");
    await db.execute(sql`
      ALTER TABLE monitoring_sessions
      ADD COLUMN IF NOT EXISTS related_docs_context TEXT
    `);

    // 6. Add column comments
    console.log("6. Adding column comments...");
    await db.execute(sql`
      COMMENT ON COLUMN monitoring_sessions.linear_issue_id IS 'Linear issue identifier (e.g., LIN-341)'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN monitoring_sessions.linear_issue_title IS 'Title of the linked Linear issue'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN monitoring_sessions.linear_issue_description IS 'Full description of the linked Linear issue'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN monitoring_sessions.additional_context IS 'User-provided free-text context about their work'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN monitoring_sessions.related_docs_context IS 'RAG-retrieved related documents at session start'
    `);

    console.log("\n✅ Migration 0019 completed successfully!");
    console.log("\nColumns added to monitoring_sessions:");
    console.log("  • linear_issue_id (VARCHAR 100)");
    console.log("  • linear_issue_title (TEXT)");
    console.log("  • linear_issue_description (TEXT)");
    console.log("  • additional_context (TEXT)");
    console.log("  • related_docs_context (TEXT)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
