import { Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

/**
 * Middleware to ensure database connection stays alive for chat routes
 * Pings the database before each request to prevent idle timeout issues
 */
export async function keepAliveMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Quick ping to keep connection alive
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    next();
  } catch (error) {
    console.error("❌ Keep-alive ping failed:", error);
    // Continue anyway - let the actual query handler deal with connection errors
    next();
  }
}
