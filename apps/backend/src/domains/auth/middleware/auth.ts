import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { supabase } from "../../shared-infra/lib/supabase.js";
import { db } from "../../../db/client.js";
import { users, userPermissions } from "../../../db/schema/index.js";

/**
 * Middleware to require authentication
 * Validates JWT token and attaches user info to request
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid authorization header",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token",
      });
      return;
    }

    // Attach user info to request
    req.user = user;
    req.userId = user.id;

    // Lookup user's organization and role from database
    const userRecord = await db
      .select({ organizationId: users.organizationId, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (userRecord[0]) {
      req.organizationId = userRecord[0].organizationId;
      req.userRole = userRecord[0].role;

      // Check if user has any direct reports (lightweight check)
      const reportCheck = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.managerId, user.id))
        .limit(1);
      req.isManager = reportCheck.length > 0;

      // Load user permissions
      const permRows = await db
        .select({ permission: userPermissions.permission })
        .from(userPermissions)
        .where(eq(userPermissions.userId, user.id));
      req.userPermissions = permRows.map((r) => r.permission);
    }

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication failed",
    });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Used for endpoints that work with or without authentication
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No auth header, continue without user
      next();
      return;
    }

    const token = authHeader.substring(7);

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (user) {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // If optional auth fails, just continue without user
    next();
  }
}
