import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { config } from "../config";
import * as schema from "./schema/index";

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: config.database.url,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Connection pool error handler (keep only error logging)
pool.on("error", (err) => {
  console.error("❌ Unexpected database pool error:", err);
  console.error("Pool stats:", {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
});

// Test database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// Pool lifecycle is managed centrally in index.ts shutdown handler.
