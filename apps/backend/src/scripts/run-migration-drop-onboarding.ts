/**
 * Migration Script: Drop legacy onboarding tables
 *
 * Removes roadmap, expert, and nudge tables that were part of the old
 * onboarding product. These tables are no longer referenced by the app.
 *
 * Tables dropped (in dependency order):
 * 1. roadmap_template_sources (FK → roadmap_template_tasks, source_materials)
 * 2. user_roadmap_tasks (FK → user_template_assignments)
 * 3. user_template_assignments (FK → roadmap_templates, users)
 * 4. roadmap_template_tasks (FK → roadmap_templates)
 * 5. roadmap_templates (FK → organizations)
 * 6. expert_interactions (FK → expert_profiles)
 * 7. expert_topics (FK → users)
 * 8. expert_profiles (FK → users)
 * 9. nudges (FK → users, expert_profiles)
 *
 * Run with: npx tsx src/scripts/run-migration-drop-onboarding.ts
 */

import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("Starting Migration: Drop legacy onboarding tables\n");

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const tablesToDrop = [
        "roadmap_template_sources",
        "user_roadmap_tasks",
        "user_template_assignments",
        "roadmap_template_tasks",
        "roadmap_templates",
        "expert_interactions",
        "expert_topics",
        "expert_profiles",
        "nudges",
      ];

      for (const table of tablesToDrop) {
        // Check if table exists before dropping
        const exists = await client.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          )`,
          [table]
        );

        if (exists.rows[0].exists) {
          await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
          console.log(`  Dropped table: ${table}`);
        } else {
          console.log(`  Skipped (not found): ${table}`);
        }
      }

      await client.query("COMMIT");
      console.log("\nMigration complete: All legacy onboarding tables dropped.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("\nMigration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
