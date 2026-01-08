/**
 * Simple database connection test script
 * Run with: npx tsx apps/backend/src/scripts/test-db.ts
 */

import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in environment variables");
  process.exit(1);
}

console.log("🔍 Testing database connection...");
console.log("📍 Database URL prefix:", DATABASE_URL.substring(0, 30) + "...");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  try {
    // Test basic connection
    console.log("\n1️⃣ Testing basic connection...");
    const client = await pool.connect();
    const timeResult = await client.query("SELECT NOW() as time");
    console.log("   ✅ Connected! Server time:", timeResult.rows[0].time);

    // Test users table
    console.log("\n2️⃣ Querying users table...");
    const usersResult = await client.query(`
      SELECT id, email, created_at 
      FROM users 
      LIMIT 5
    `);
    console.log(`   ✅ Found ${usersResult.rowCount} user(s):`);
    usersResult.rows.forEach((user, i) => {
      console.log(`      ${i + 1}. ${user.email} (created: ${user.created_at})`);
    });

    // Test organizations table
    console.log("\n3️⃣ Querying organizations table...");
    const orgsResult = await client.query(`
      SELECT id, name, created_at 
      FROM organizations 
      LIMIT 5
    `);
    console.log(`   ✅ Found ${orgsResult.rowCount} organization(s):`);
    orgsResult.rows.forEach((org, i) => {
      console.log(`      ${i + 1}. ${org.name} (created: ${org.created_at})`);
    });

    client.release();
    console.log("\n✅ All database tests passed!");
  } catch (error) {
    console.error("\n❌ Database test failed:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testConnection();
