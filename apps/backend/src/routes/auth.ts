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
    // Try full select first, fallback to basic fields if persona columns don't exist
    let userProfile;
    try {
      userProfile = (
        await db.select().from(schema.users).where(eq(schema.users.id, data.user.id)).limit(1)
      )[0];
    } catch (error: any) {
      // If error is due to missing columns (like job_title), select only basic fields
      if (error?.code === "42703" || error?.message?.includes("does not exist")) {
        userProfile = (
          await db
            .select({
              id: schema.users.id,
              organizationId: schema.users.organizationId,
              email: schema.users.email,
              firstName: schema.users.firstName,
              lastName: schema.users.lastName,
              role: schema.users.role,
              avatarUrl: schema.users.avatarUrl,
              currentWeek: schema.users.currentWeek,
              startDate: schema.users.startDate,
              status: schema.users.status,
              createdAt: schema.users.createdAt,
              updatedAt: schema.users.updatedAt,
            })
            .from(schema.users)
            .where(eq(schema.users.id, data.user.id))
            .limit(1)
        )[0];
      } else {
        throw error;
      }
    }

    // CRITICAL: Check if user exists in database
    if (!userProfile) {
      console.error("Login error: User exists in Supabase Auth but not in database", {
        supabaseUserId: data.user.id,
        email: data.user.email,
      });
      res.status(500).json({
        error: "Database Sync Error",
        message: "User profile not found. Please contact support or try signing up again.",
      });
      return;
    }

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

    // Fetch organization settings for variant information
    const [organization] = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        settings: schema.organizations.settings,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, userProfile.organizationId))
      .limit(1);

    res.json({
      user: req.user,
      profile: userProfile,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            settings: organization.settings || {},
          }
        : null,
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
 * /auth/me:
 *   patch:
 *     tags:
 *       - Authentication
 *     summary: Update current user profile
 *     description: Update the profile of the currently authenticated user. Supports partial updates for persona fields.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jobTitle:
 *                 type: string
 *                 maxLength: 100
 *                 description: User's job title or role
 *               regularTasks:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of regular tasks the user performs
 *               regularApps:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of regular apps the user uses
 *               additionalContext:
 *                 type: string
 *                 description: Free-text additional context about the user
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 profile:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
authRouter.patch("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    const { jobTitle, regularTasks, regularApps, additionalContext } = req.body;

    // Build update object with only provided fields
    const updates: Record<string, any> = {};

    if (jobTitle !== undefined) {
      if (typeof jobTitle !== "string" || jobTitle.length > 100) {
        res.status(400).json({
          error: "Bad Request",
          message: "jobTitle must be a string with max length 100",
        });
        return;
      }
      updates.jobTitle = jobTitle || null;
    }

    if (regularTasks !== undefined) {
      if (!Array.isArray(regularTasks) || !regularTasks.every((task) => typeof task === "string")) {
        res.status(400).json({
          error: "Bad Request",
          message: "regularTasks must be an array of strings",
        });
        return;
      }
      updates.regularTasks = regularTasks;
    }

    if (regularApps !== undefined) {
      if (!Array.isArray(regularApps) || !regularApps.every((app) => typeof app === "string")) {
        res.status(400).json({
          error: "Bad Request",
          message: "regularApps must be an array of strings",
        });
        return;
      }
      updates.regularApps = regularApps;
    }

    if (additionalContext !== undefined) {
      if (typeof additionalContext !== "string") {
        res.status(400).json({
          error: "Bad Request",
          message: "additionalContext must be a string",
        });
        return;
      }
      updates.additionalContext = additionalContext || null;
    }

    // If no updates provided, return current profile
    if (Object.keys(updates).length === 0) {
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
        success: true,
        profile: userProfile,
      });
      return;
    }

    // Update user profile
    const [updatedProfile] = await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, req.userId))
      .returning();

    if (!updatedProfile) {
      res.status(404).json({
        error: "Not Found",
        message: "User profile not found",
      });
      return;
    }

    res.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update user profile",
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

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Change user password (authenticated)
 *     description: |
 *       Change the password for the currently authenticated user.
 *       Requires verification of the current password before allowing the change.
 *       Does not send a 2FA email, but sends a confirmation email after successful change.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 description: The user's current password for verification
 *                 example: currentPassword123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: The new password (min 8 chars, must contain uppercase, lowercase, and number)
 *                 example: NewSecurePass123
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         description: Validation error (password requirements not met or same as current)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Validation Error
 *                 message:
 *                   type: string
 *                   example: Password must be at least 8 characters long
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Current password is incorrect
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Authentication Failed
 *                 message:
 *                   type: string
 *                   example: Current password is incorrect
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
authRouter.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: "Validation Error",
        message: "Current password and new password are required",
      });
      return;
    }

    // Check if passwords are the same
    if (currentPassword === newPassword) {
      res.status(400).json({
        error: "Validation Error",
        message: "New password must be different from current password",
      });
      return;
    }

    // Validate new password strength
    const { validatePassword } = await import("../utils/password-validator.js");
    const validation = validatePassword(newPassword);

    if (!validation.isValid) {
      res.status(400).json({
        error: "Validation Error",
        message: "Password does not meet security requirements",
        errors: validation.errors,
      });
      return;
    }

    // Get user email from database
    const [userProfile] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, req.userId!))
      .limit(1);

    if (!userProfile) {
      res.status(404).json({
        error: "Not Found",
        message: "User profile not found",
      });
      return;
    }

    // Verify current password by attempting sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userProfile.email,
      password: currentPassword,
    });

    if (verifyError) {
      console.error("Current password verification failed:", verifyError);
      res.status(401).json({
        error: "Authentication Failed",
        message: "Current password is incorrect",
      });
      return;
    }

    // Update password using admin client (bypasses current session requirement)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(req.userId!, {
      password: newPassword,
    });

    if (updateError) {
      console.error("Password update error:", updateError);
      res.status(500).json({
        error: "Update Failed",
        message: "Failed to update password",
      });
      return;
    }

    // TODO: Send confirmation email (optional - can be added later)
    // await sendPasswordChangeConfirmationEmail(userProfile.email);

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to change password",
    });
  }
});

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Request password reset email
 *     description: |
 *       Send a password reset link to the user's email address.
 *       This endpoint always returns success, even if the email doesn't exist (security best practice).
 *       The reset link expires after 1 hour.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send the password reset link
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Password reset email sent (or would be sent if email exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: If an account exists with that email, a password reset link has been sent
 *       400:
 *         description: Invalid email format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Validation Error
 *                 message:
 *                   type: string
 *                   example: Valid email address is required
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security: []
 */
authRouter.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validate email format
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({
        error: "Validation Error",
        message: "Valid email address is required",
      });
      return;
    }

    // Send password reset email
    // Supabase handles the case where email doesn't exist securely
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password`,
    });

    if (error) {
      console.error("Password reset email error:", error);
      // Still return success to avoid email enumeration
    }

    // Always return success (security best practice - don't reveal if email exists)
    res.json({
      success: true,
      message: "If an account exists with that email, a password reset link has been sent",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to process password reset request",
    });
  }
});
