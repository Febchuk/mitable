import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";

export const authRouter = Router();

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Create a new user account
 *     description: Register a new user with email and password. Creates an account in Supabase Auth and a profile in the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - organizationId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: securePassword123
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                       format: email
 *                 session:
 *                   $ref: '#/components/schemas/Session'
 *                 message:
 *                   type: string
 *                   example: User created successfully. Please check your email to confirm your account.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security: []
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
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Sign in with email and password
 *     description: Authenticate an existing user and retrieve session tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securePassword123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                 session:
 *                   $ref: '#/components/schemas/Session'
 *                 profile:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security: []
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
 * @openapi
 * /auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Sign out the current user
 *     description: Invalidate the current session token
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Signed out successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
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
 * @openapi
 * /auth/me:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get current user profile
 *     description: Retrieve the profile of the currently authenticated user
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                 profile:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
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
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Refresh the access token
 *     description: Exchange a refresh token for a new access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 description: JWT refresh token from previous login
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security: []
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
