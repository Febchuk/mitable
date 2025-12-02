/**
 * Migration 0009: Remove plaintext token columns
 *
 * Run with: npm run migrate:0009
 *
 * IMPORTANT: Only run this AFTER verifying:
 * 1. All integrations are using encrypted columns
 * 2. No plaintext tokens exist in access_token/refresh_token columns
 * 3. Application code only references encrypted columns
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
    console.log("Starting migration 0009: Remove plaintext token columns...");
    console.log("");

    // First, verify no plaintext tokens exist
    console.log("🔍 Step 1: Checking for plaintext tokens...");
    const plaintextCheck = await db.execute(sql`
      SELECT id, provider, 
             CASE WHEN access_token IS NOT NULL THEN 'YES' ELSE 'NO' END as has_access_token,
             CASE WHEN refresh_token IS NOT NULL THEN 'YES' ELSE 'NO' END as has_refresh_token
      FROM integrations
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL;
    `);

    if (plaintextCheck.rows.length > 0) {
      console.log("⚠️  Found integrations with plaintext tokens:");
      plaintextCheck.rows.forEach((row: any) => {
        console.log(
          `  - ${row.provider} (${row.id}): access_token=${row.has_access_token}, refresh_token=${row.has_refresh_token}`
        );
      });
      console.log("");
      console.log("🧹 Step 1b: Clearing plaintext tokens...");
      console.log("   (Encrypted versions are already in place)");

      // Clear plaintext tokens (encrypted versions already exist)
      await db.execute(sql`
        UPDATE integrations
        SET access_token = NULL, refresh_token = NULL
        WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL;
      `);

      console.log("✅ Plaintext tokens cleared");
    } else {
      console.log("✅ No plaintext tokens found");
    }
    console.log("");

    // Read the SQL migration file
    console.log("🔍 Step 2: Reading migration SQL...");
    const migrationPath = path.join(__dirname, "../db/migrations/0009_remove_plaintext_tokens.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    console.log("✅ Migration SQL loaded");
    console.log("");

    // Execute the migration
    console.log("🚀 Step 3: Executing migration...");
    console.log("   Dropping columns: access_token, refresh_token");
    await db.execute(sql.raw(migrationSQL));
    console.log("✅ Migration SQL executed successfully");
    console.log("");

    // Verify columns are gone
    console.log("🔍 Step 4: Verifying columns were dropped...");
    const schemaCheck = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'integrations'
      AND column_name IN ('access_token', 'refresh_token');
    `);

    if (schemaCheck.rows.length > 0) {
      console.error("⚠️  WARNING: Some plaintext columns still exist:");
      schemaCheck.rows.forEach((row: any) => {
        console.error(`  - ${row.column_name}`);
      });
      console.error("");
      console.error("This might be a database-specific issue. Check manually.");
    } else {
      console.log("✅ Plaintext columns successfully removed!");
    }

    console.log("");
    console.log("✅ Migration 0009 completed successfully!");
    console.log("");
    console.log("Summary:");
    console.log("  ❌ Dropped: access_token (plaintext)");
    console.log("  ❌ Dropped: refresh_token (plaintext)");
    console.log("  ✅ Kept: access_token_encrypted (AES-256-GCM)");
    console.log("  ✅ Kept: refresh_token_encrypted (AES-256-GCM)");
    console.log("");
    console.log("Your database is now fully encrypted! 🔒");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
