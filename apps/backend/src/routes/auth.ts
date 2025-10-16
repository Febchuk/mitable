import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";

export const authRouter = Router();

/**
 * POST /api/auth/signup
 * Create a new user account
 */
authRouter.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, organizationId } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({
        error: "Bad Request",
        message: "Email and password are required",
      });
      return;
    }

    if (!organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "organizationId is required",
      });
      return;
    }

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          organization_id: organizationId,
        },
      },
    });

    if (error) {
      console.error("Signup error:", error);
      res.status(400).json({
        error: "Signup Failed",
        message: error.message,
      });
      return;
    }

    // Create user profile in database
    // Note: In production, this should be handled by a database trigger
    // to ensure atomicity
    if (data.user) {
      try {
        await db.insert(schema.users).values({
          id: data.user.id,
          organizationId,
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          role: "employee",
          status: "active",
        });
      } catch (dbError) {
        console.error("Error creating user profile:", dbError);
        // User is created in Auth but profile creation failed
        // You might want to implement cleanup or retry logic here
      }
    }

    res.status(201).json({
      user: data.user,
      session: data.session,
      message: "User created successfully. Please check your email to confirm your account.",
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create user",
    });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({
        error: "Bad Request",
        message: "Email and password are required",
      });
      return;
    }

    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Login error:", error);
      res.status(401).json({
        error: "Authentication Failed",
        message: "Invalid email or password",
      });
      return;
    }

    // Fetch user profile from database
    const [userProfile] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data.user.id))
      .limit(1);

    res.json({
      user: data.user,
      session: data.session,
      profile: userProfile,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to sign in",
    });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user
 */
authRouter.post("/logout", requireAuth, async (req: Request, res: Response) => {
  try {
    // Get the token from the Authorization header
    const token = req.headers.authorization?.substring(7);

    if (!token) {
      res.status(400).json({
        error: "Bad Request",
        message: "No token provided",
      });
      return;
    }

    // Sign out from Supabase Auth
    const { error } = await supabase.auth.admin.signOut(token);

    if (error) {
      console.error("Logout error:", error);
      res.status(500).json({
        error: "Logout Failed",
        message: error.message,
      });
      return;
    }

    res.json({
      message: "Signed out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to sign out",
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    // Fetch user profile from database
    const [userProfile] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, req.userId))
      .limit(1);

    if (!userProfile) {
      res.status(404).json({
        error: "Not Found",
        message: "User profile not found",
      });
      return;
    }

    res.json({
      user: req.user,
      profile: userProfile,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user profile",
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh the access token
 */
authRouter.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({
        error: "Bad Request",
        message: "Refresh token is required",
      });
      return;
    }

    // Refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      console.error("Token refresh error:", error);
      res.status(401).json({
        error: "Refresh Failed",
        message: "Invalid or expired refresh token",
      });
      return;
    }

    res.json({
      session: data.session,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to refresh token",
    });
  }
});
