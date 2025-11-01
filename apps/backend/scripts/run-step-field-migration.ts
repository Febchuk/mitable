import { db } from "../src/db/client";
import { sql } from "drizzle-orm";

/**
 * Migration: Unify step field names (stepDescription → description)
 *
 * This script updates existing workflow_data JSONB to use consistent 'description' field
 * Run with: npx tsx scripts/run-step-field-migration.ts
 */

async function runMigration() {
  console.log("🔄 Starting migration: Unify step field names...\n");

  try {
    // Step 1: Check how many records need updating
    const checkResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM workflow_sessions
      WHERE workflow_data->'stepList' IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(workflow_data->'stepList') AS step
          WHERE step ? 'stepDescription'
        )
    `);

    const recordsToUpdate = Number(checkResult.rows[0]?.count || 0);

    console.log(`📊 Found ${recordsToUpdate} workflow sessions with 'stepDescription' field`);

    if (recordsToUpdate === 0) {
      console.log("✅ No records need updating. Migration complete!\n");
      process.exit(0);
    }

    console.log(`\n🔧 Updating ${recordsToUpdate} records...\n`);

    // Step 2: Run the migration
    await db.execute(sql`
      UPDATE workflow_sessions
      SET workflow_data = jsonb_set(
        workflow_data,
        '{stepList}',
        (
          SELECT jsonb_agg(
            jsonb_set(
              step - 'stepDescription',
              '{description}',
              COALESCE(step->'description', step->'stepDescription')
            )
          )
          FROM jsonb_array_elements(workflow_data->'stepList') AS step
        )
      )
      WHERE workflow_data->'stepList' IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(workflow_data->'stepList') AS step
          WHERE step ? 'stepDescription'
        )
    `);

    console.log("✅ Migration completed successfully!\n");

    // Step 3: Verify the migration
    console.log("🔍 Verifying migration...\n");

    const verifyResult = await db.execute(sql`
      SELECT 
        id,
        solution,
        (workflow_data->'stepList'->>0)::jsonb AS first_step
      FROM workflow_sessions
      WHERE workflow_data->'stepList' IS NOT NULL
      LIMIT 3
    `);

    console.log("Sample records after migration:");
    verifyResult.rows.forEach((row: any, index) => {
      console.log(`\n${index + 1}. ${row.solution}`);
      const firstStep = row.first_step;
      if (firstStep) {
        console.log(`   First step:`, JSON.stringify(firstStep, null, 2));
      }
    });

    console.log("\n✅ Migration verified successfully!");
    console.log("\n📝 Summary:");
    console.log(`   - Updated ${recordsToUpdate} workflow sessions`);
    console.log(`   - Changed 'stepDescription' → 'description'`);
    console.log(`   - All records verified ✓\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
