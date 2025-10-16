import { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase.js";
import { User } from "@supabase/supabase-js";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * Required Authentication Middleware
 *
 * Verifies the JWT token from the Authorization header and attaches the user to req.user
 * Returns 401 if token is missing or invalid
 *
 * SECURITY NOTE: Always use getUser() not getSession() on the server
 * getUser() validates the token with the Supabase Auth server every time
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid authorization header",
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase Auth server
    // IMPORTANT: Always use getUser() for server-side validation
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

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication verification failed",
    });
  }
}

/**
 * Optional Authentication Middleware
 *
 * Attempts to verify the JWT token but doesn't fail if token is missing
 * Useful for routes that have different behavior for authenticated vs anonymous users
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    // Continue regardless of auth status
    next();
  } catch (error) {
    // Log error but continue
    console.error("Optional auth middleware error:", error);
    next();
  }
}
