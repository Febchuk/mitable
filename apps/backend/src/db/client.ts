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

// Connection pool event listeners for monitoring
pool.on("error", (err) => {
  console.error("❌ Unexpected database pool error:", err);
  console.error("Pool stats:", {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
});

pool.on("connect", () => {
  if (config.nodeEnv === "development") {
    console.log("🔌 New database connection established");
  }
});

// Throttle pool stats logging to reduce noise (max once per second)
let lastPoolLogTime = 0;
const POOL_LOG_THROTTLE_MS = 1000;

pool.on("acquire", () => {
  if (config.nodeEnv === "development") {
    const now = Date.now();
    if (now - lastPoolLogTime > POOL_LOG_THROTTLE_MS) {
      console.log(
        `📊 Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`
      );
      lastPoolLogTime = now;
    }
  }
});

pool.on("remove", () => {
  if (config.nodeEnv === "development") {
    console.log("🔌 Database connection removed from pool");
  }
});

// Test database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0].now);
    console.log("📊 Initial pool stats:", {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    });
    client.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await pool.end();
  console.log("Database pool closed");
  process.exit(0);
});
