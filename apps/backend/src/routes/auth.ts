import { Router, Request, Response } from "express";
import { supabase, supabaseAdmin } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { subscriptionService } from "../services/subscription.service.js";
import { usageService } from "../services/usage.service.js";

export const authRouter = Router();

/**
 * @openapi
 * /auth/signup-organization:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Create organization and admin account
 *     description: |
 *       Register a new organization with the first admin user. This endpoint performs several operations atomically:
 *
 *       1. **Orphan Detection & Cleanup**: Checks for orphaned Supabase Auth users (users that exist in Auth but not in database from failed previous signups). If found, automatically deletes them before proceeding.
 *       2. **Organization Creation**: Creates a new organization record
 *       3. **Admin User Creation**: Creates admin user via Supabase Admin API with auto-confirmed email (bypasses email verification)
 *       4. **Role Assignment**: Database trigger creates user with 'employee' role, then updates to 'admin'
 *       5. **Auto-Login**: Automatically signs in the new admin user and returns session tokens
 *
 *       If auto-login fails, the organization and user are still created successfully, but session will be null with a message to login manually.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - organizationName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@company.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: securePassword123
 *               firstName:
 *                 type: string
 *                 example: Jane
 *               lastName:
 *                 type: string
 *                 example: Smith
 *               organizationName:
 *                 type: string
 *                 example: Acme Corp
 *               organizationDomain:
 *                 type: string
 *                 description: Optional company email domain for auto-joining (e.g., "acme.com")
 *                 example: acme.com
 *     responses:
 *       201:
 *         description: Organization and admin created successfully (auto-login succeeded)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
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
 *                   allOf:
 *                     - $ref: '#/components/schemas/Session'
 *                     - nullable: true
 *                       description: Session tokens if auto-login succeeded, null if auto-login failed
 *                 organization:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     domain:
 *                       type: string
 *                       nullable: true
 *                 profile:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *                   description: Optional message, included if auto-login failed
 *                   example: Organization created. Please login to continue.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       409:
 *         description: Conflict - Email already exists or organization domain already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [EMAIL_ALREADY_EXISTS, CONFLICT]
 *                       example: EMAIL_ALREADY_EXISTS
 *                     message:
 *                       type: string
 *                       example: A user with this email already exists
 *       500:
 *         description: Internal server error or cleanup failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [CLEANUP_FAILED, INTERNAL_ERROR, SIGNUP_FAILED]
 *                       example: CLEANUP_FAILED
 *                     message:
 *                       type: string
 *                       example: Unable to cleanup incomplete previous signup. Please contact support.
 *     security: []
 */
authRouter.post("/signup-organization", async (req: Request, res: Response) => {
  try {
    const {
      accountType = "team", // Default to team for backwards compatibility
      email,
      password,
      firstName,
      lastName,
      organizationName,
      organizationDomain,
    } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required",
        },
      });
      return;
    }

    if (!firstName || !lastName) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "First name and last name are required",
        },
      });
      return;
    }

    // Determine organization name based on account type
    let finalOrgName: string;
    if (accountType === "personal") {
      // Auto-generate org name for personal accounts
      finalOrgName = `${firstName}'s Workspace`;
    } else {
      // Team accounts require organization name
      if (!organizationName) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Organization name is required for team accounts",
          },
        });
        return;
      }
      finalOrgName = organizationName;
    }

    // Check if user already exists in database
    const [existingDbUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existingDbUser) {
      res.status(409).json({
        success: false,
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "A user with this email already exists",
        },
      });
      return;
    }

    // Check for orphaned Supabase Auth users (exist in Auth but not in database)
    // This can happen if a previous signup attempt created the auth user but failed to create the database profile
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const orphanedAuthUser = authUsers?.users?.find((u) => u.email === email);

    if (orphanedAuthUser) {
      console.log(`Detected orphaned Supabase Auth user: ${email} (ID: ${orphanedAuthUser.id})`);
      console.log(`Cleaning up orphaned user before proceeding with signup...`);

      // Delete the orphaned auth user to allow fresh signup
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(orphanedAuthUser.id);

      if (deleteError) {
        console.error(`Failed to cleanup orphaned user:`, deleteError);
        res.status(500).json({
          success: false,
          error: {
            code: "CLEANUP_FAILED",
            message: "Unable to cleanup incomplete previous signup. Please contact support.",
          },
        });
        return;
      }

      console.log(`Successfully cleaned up orphaned user: ${email}`);
    }

    // Check if organization with same domain already exists (Team accounts only)
    if (accountType === "team" && organizationDomain) {
      const [existingOrg] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.domain, organizationDomain))
        .limit(1);

      if (existingOrg) {
        res.status(409).json({
          success: false,
          error: {
            code: "CONFLICT",
            message: `An organization with the domain "${organizationDomain}" already exists`,
          },
        });
        return;
      }
    }

    // Create organization
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: finalOrgName,
        // Personal accounts don't have a domain
        domain: accountType === "team" ? organizationDomain || null : null,
      })
      .returning({
        id: schema.organizations.id,
        name: schema.organizations.name,
        domain: schema.organizations.domain,
      });

    if (!organization) {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create organization",
        },
      });
      return;
    }

    // Create subscription for new organization
    // Personal accounts get "free" tier, Team accounts get "team" tier
    try {
      const tier = accountType === "personal" ? "free" : "team";
      await subscriptionService.createSubscription(organization.id, tier);
      await usageService.ensureCurrentPeriod(organization.id);
    } catch (subError) {
      console.error("Failed to create subscription:", subError);
      // Non-fatal: continue with signup even if subscription creation fails
      // Subscription can be created later or fixed manually
    }

    // Create admin user in Supabase Auth using admin API (bypasses email confirmation)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for immediate access
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        organization_id: organization.id,
      },
    });

    if (error) {
      console.error("Signup error:", error);
      // Rollback: Delete the organization if user creation fails
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organization.id));

      res.status(400).json({
        success: false,
        error: {
          code: "SIGNUP_FAILED",
          message: error.message,
        },
      });
      return;
    }

    // Database trigger created user with 'employee' role, update to 'admin'
    if (data.user) {
      await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, data.user.id));
    }

    // Auto-login: Generate session by signing in with the new credentials
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.error("Auto-login error:", signInError);
      // User is created but auto-login failed - still return success with null session
      const [userProfile] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, data.user!.id))
        .limit(1);

      res.status(201).json({
        success: true,
        user: data.user,
        session: null,
        organization,
        profile: userProfile,
        message: "Organization created. Please login to continue.",
      });
      return;
    }

    // Fetch complete user profile
    const [userProfile] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data.user!.id))
      .limit(1);

    res.status(201).json({
      success: true,
      user: signInData.user,
      session: signInData.session,
      organization,
      profile: userProfile,
    });
  } catch (error) {
    console.error("Organization signup error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to create organization and admin account",
      },
    });
  }
});

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
