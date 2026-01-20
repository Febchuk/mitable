/**
 * Migration: Add persona fields to users table
 *
 * Adds columns for user persona/profile information:
 * - job_title: User's job title/role
 * - regular_tasks: Array of regular tasks (JSONB)
 * - regular_apps: Array of regular apps (JSONB)
 * - additional_context: Free-text additional context
 *
 * Run with: npm run migrate:persona-fields
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration: Add persona fields to users table...\n");

    // 1. Add job_title column
    console.log("1. Adding job_title column...");
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(100)
    `);

    // 2. Add regular_tasks column (JSONB array)
    console.log("2. Adding regular_tasks column...");
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS regular_tasks JSONB DEFAULT '[]'::jsonb
    `);

    // 3. Add regular_apps column (JSONB array)
    console.log("3. Adding regular_apps column...");
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS regular_apps JSONB DEFAULT '[]'::jsonb
    `);

    // 4. Add additional_context column
    console.log("4. Adding additional_context column...");
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS additional_context TEXT
    `);

    // 5. Add column comments for documentation
    console.log("5. Adding column comments...");
    await db.execute(sql`
      COMMENT ON COLUMN users.job_title IS 'User job title or role (e.g., Software Engineer, Designer)'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN users.regular_tasks IS 'Array of regular tasks the user performs (JSONB array of strings)'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN users.regular_apps IS 'Array of regular apps the user uses (JSONB array of strings)'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN users.additional_context IS 'Free-text additional context about the user'
    `);

    console.log("\n✅ Migration completed successfully!");
    console.log("\nNew columns added to users table:");
    console.log("  • job_title (VARCHAR(100))");
    console.log("  • regular_tasks (JSONB, default: [])");
    console.log("  • regular_apps (JSONB, default: [])");
    console.log("  • additional_context (TEXT)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
