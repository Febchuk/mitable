import { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";

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
