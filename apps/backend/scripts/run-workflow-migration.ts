import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Run Workflow Tables Migration
 *
 * Creates workflow_sessions and workflow_interactions tables
 * with proper organization/user/conversation relationships
 */
async function runMigration() {
  console.log("🚀 Starting workflow tables migration...\n");

  // Validate DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured. Please set it in your .env file.");
  }

  console.log("✅ Database URL found");
  console.log(`📍 Connecting to: ${databaseUrl.split("@")[1]}\n`);

  // Create PostgreSQL pool
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    // Test connection
    console.log("🔌 Testing database connection...");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful\n");

    // Read migration file
    const migrationPath = path.join(__dirname, "..", "drizzle", "0007_add_workflow_tables.sql");
    console.log(`📄 Reading migration file: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    console.log(`✅ Migration file loaded (${migrationSQL.length} bytes)\n`);

    // Execute migration
    console.log("⚡ Executing migration SQL...\n");
    console.log("=".repeat(60));
    console.log(migrationSQL);
    console.log("=".repeat(60));
    console.log("");

    await pool.query(migrationSQL);

    console.log("✅ Migration executed successfully!\n");

    // Verify tables were created
    console.log("🔍 Verifying table creation...");

    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('workflow_sessions', 'workflow_interactions')
      ORDER BY table_name;
    `);

    console.log(`✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });
    console.log("");

    // Verify indexes
    console.log("🔍 Verifying indexes...");
    const indexesResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('workflow_sessions', 'workflow_interactions')
      AND schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    console.log(`✅ Created ${indexesResult.rows.length} indexes:`);
    indexesResult.rows.forEach((row) => {
      console.log(`   - ${row.indexname}`);
    });
    console.log("");

    // Show table structure
    console.log("📋 workflow_sessions columns:");
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workflow_sessions'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    columnsResult.rows.forEach((col) => {
      const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
      console.log(`   - ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}`);
    });
    console.log("");

    console.log("🎉 Migration completed successfully!");
    console.log("\n✨ You can now use workflow_sessions and workflow_interactions tables");
  } catch (error) {
    console.error("\n❌ Migration failed!");
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      if (error.stack) {
        console.error("\nStack trace:");
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    // Close pool
    await pool.end();
    console.log("\n👋 Database connection closed");
  }
}

// Run migration
runMigration();
