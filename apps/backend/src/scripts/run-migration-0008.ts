#!/usr/bin/env tsx
/**
 * Run Migration 0008: Add Encrypted Token Columns
 *
 * This script runs the SQL migration to add encrypted token columns
 * to the integrations table.
 *
 * Usage:
 *   npm run migrate:0008
 *   OR
 *   tsx src/scripts/run-migration-0008.ts
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log("\n🚀 Running Migration 0008: Add Encrypted Token Columns\n");

  try {
    // Read the migration SQL file
    const migrationPath = path.join(
      __dirname,
      "..",
      "db",
      "migrations",
      "0008_add_encrypted_tokens.sql"
    );

    console.log(`📄 Reading migration file: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    console.log("📝 Migration SQL:");
    console.log("─".repeat(60));
    console.log(migrationSQL);
    console.log("─".repeat(60));
    console.log();

    // Execute the migration
    console.log("⚡ Executing migration...");
    await db.execute(sql.raw(migrationSQL));

    console.log("\n✅ Migration 0008 completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("   1. Verify columns exist in database");
    console.log("   2. Test OAuth flows (new connections will be encrypted)");
    console.log("   3. Run backfill script: npm run backfill-tokens");
    console.log();

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.error();
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

runMigration();
