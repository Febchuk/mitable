import { Router, Request, Response } from "express";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { NOTION_CONFIG } from "../services/notion.service.js";

const router = Router();

// Standardized error response interface
interface ApiError {
  error: string; // Error code (e.g., "SLACK_NOT_CONFIGURED")
  message: string; // User-friendly message
  details?: unknown; // Additional context (optional)
}

// Helper function to send standardized error responses
function sendError(
  res: Response,
  statusCode: number,
  errorCode: string,
  message: string,
  details?: unknown
): void {
  const error: ApiError = { error: errorCode, message };
  if (details) {
    error.details = details;
  }
  res.status(statusCode).json(error);
}

// Type definition for Slack OAuth v2 access response
interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id: string;
  app_id: string;
  team: {
    id: string;
    name: string;
  };
  authed_user: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
}

// Type definition for Notion OAuth token response
interface NotionOAuthResponse {
  access_token: string;
  refresh_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner: {
    type: string;
    user?: {
      id: string;
      name?: string;
      avatar_url?: string;
      type?: string;
      person?: { email?: string };
    };
  };
  duplicated_template_id?: string;
}

// Slack OAuth configuration from environment
const SLACK_CLIENT_ID = config.slack?.clientId || process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = config.slack?.clientSecret || process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI =
  config.slack?.redirectUri ||
  process.env.SLACK_REDIRECT_URI ||
  "http://localhost:3000/api/integrations/slack/callback";

/**
 * POST /api/integrations/slack/oauth/start
 * Initiate Slack OAuth flow
 * Returns the authorization URL for the user to visit
 */
router.post(
  "/slack/oauth/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Validate Slack credentials are configured
      if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
        sendError(
          res,
          500,
          "SLACK_NOT_CONFIGURED",
          "Slack OAuth credentials not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET."
        );
        return;
      }

      // Get user's organization
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Required bot token scopes for message fetching and metadata
      const scopes = [
        "channels:history", // Read public channel messages
        "channels:read", // List public channels
        "groups:history", // Read private channel messages
        "groups:read", // List private channels
        "users:read", // Get user information (names, emails)
        "chat:write", // Optional: post messages (for future features)
      ];

      // Build Slack OAuth URL
      // Use organizationId as state for security and to identify the org after redirect
      const authUrl =
        `https://slack.com/oauth/v2/authorize?` +
        `client_id=${SLACK_CLIENT_ID}&` +
        `scope=${scopes.join(",")}&` +
        `redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&` +
        `state=${user.organizationId}`;

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Slack OAuth:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to initiate Slack OAuth",
      });
    }
  }
);

/**
 * GET /api/integrations/slack/callback
 * Slack OAuth callback endpoint
 * Slack redirects here after user approves the app
 */
router.get("/slack/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth error (user denied access)
    if (error) {
      res.status(400).send(`
        <html>
          <head>
            <title>Slack Connection Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1>❌ Slack Connection Failed</h1>
            <p>You denied access or an error occurred.</p>
            <p>Error: ${error}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code || !state) {
      res.status(400).send(`
        <html>
          <head>
            <title>Invalid Request</title>
          </head>
          <body>
            <h1>Invalid OAuth callback</h1>
            <p>Missing authorization code or state parameter.</p>
          </body>
        </html>
      `);
      return;
    }

    const organizationId = state as string;

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID!,
        client_secret: SLACK_CLIENT_SECRET!,
        code: code as string,
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const data = (await tokenResponse.json()) as SlackOAuthResponse;

    if (!data.ok) {
      throw new Error(data.error || "Failed to exchange code for token");
    }

    // Store integration in database
    // Use INSERT ... ON CONFLICT to handle both new connections and reconnections
    await db
      .insert(schema.integrations)
      .values({
        organizationId: organizationId,
        provider: "slack",
        status: "connected",
        accessToken: data.access_token, // Bot token (xoxb-...)
        metadata: {
          team_id: data.team.id,
          team_name: data.team.name,
          bot_user_id: data.bot_user_id,
          scope: data.scope,
          app_id: data.app_id,
          authed_user: data.authed_user,
        },
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.integrations.organizationId, schema.integrations.provider],
        set: {
          status: "connected",
          accessToken: data.access_token,
          metadata: {
            team_id: data.team.id,
            team_name: data.team.name,
            bot_user_id: data.bot_user_id,
            scope: data.scope,
            app_id: data.app_id,
            authed_user: data.authed_user,
          },
          updatedAt: new Date(),
        },
      });

    console.log(`✅ Slack connected for organization: ${organizationId} (${data.team.name})`);

    // Return success page
    res.send(`
      <html>
        <head>
          <title>Slack Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              background: white;
              color: #333;
              border-radius: 10px;
              padding: 40px;
              max-width: 500px;
              margin: 0 auto;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { color: #2eb67d; margin-bottom: 10px; }
            p { font-size: 16px; line-height: 1.6; }
            .team-name { font-weight: bold; color: #667eea; }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
            }
            button:hover { background: #764ba2; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Slack Connected Successfully!</h1>
            <p>Your workspace <span class="team-name">${data.team.name}</span> is now connected to Mitable.</p>
            <p>You can close this window and return to the app.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Auto-close after 1 second
            setTimeout(() => window.close(), 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Slack OAuth callback error:", error);
    res.status(500).send(`
      <html>
        <head>
          <title>Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #e01e5a; }
          </style>
        </head>
        <body>
          <h1>❌ Connection Error</h1>
          <p>Failed to connect to Slack. Please try again.</p>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * DELETE /api/integrations/slack/disconnect
 * Disconnect Slack integration
 */
router.delete(
  "/slack/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Get user's organization
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Update integration status to disconnected
      await db
        .update(schema.integrations)
        .set({
          status: "disconnected",
          accessToken: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.integrations.organizationId, user.organizationId),
            eq(schema.integrations.provider, "slack")
          )
        );

      console.log(`✅ Slack disconnected for organization: ${user.organizationId}`);

      res.json({ success: true, message: "Slack integration disconnected" });
    } catch (error) {
      console.error("Error disconnecting Slack:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Slack integration",
      });
    }
  }
);

/**
 * GET /api/integrations/slack/channels
 * Fetch available Slack channels the bot has access to
 */
router.get("/slack/channels", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Get user's organization
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Import slack service dynamically
    const { slackService } = await import("../services/slack.service.js");

    const channels = await slackService.listChannels(user.organizationId);

    res.json({ channels });
  } catch (error) {
    console.error("Error fetching Slack channels:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch channels",
    });
  }
});

/**
 * POST /api/integrations/slack/configure
 * Save selected channels for syncing
 */
router.post("/slack/configure", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { selectedChannels } = req.body;

    if (!selectedChannels || !Array.isArray(selectedChannels)) {
      res.status(400).json({
        error: "Bad Request",
        message: "selectedChannels must be an array of channel IDs",
      });
      return;
    }

    if (selectedChannels.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "At least one channel must be selected",
      });
      return;
    }

    // Validate channel IDs format (Slack channel IDs start with C or G followed by alphanumeric)
    const invalidChannels = selectedChannels.filter(
      (id) => typeof id !== "string" || !/^[CG][A-Z0-9]+$/.test(id)
    );
    if (invalidChannels.length > 0) {
      res.status(400).json({
        error: "Bad Request",
        message: `Invalid channel IDs: ${invalidChannels.join(", ")}`,
      });
      return;
    }

    // Get user's organization
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Get current integration to merge metadata
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, user.organizationId),
          eq(schema.integrations.provider, "slack")
        )
      )
      .limit(1);

    if (!integration) {
      res.status(404).json({
        error: "Not Found",
        message: "Slack integration not found",
      });
      return;
    }

    // Merge selected channels into existing metadata
    const updatedMetadata = {
      ...(integration.metadata as object),
      selected_channels: selectedChannels,
    };

    // Update integration metadata with selected channels
    await db
      .update(schema.integrations)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.integrations.organizationId, user.organizationId),
          eq(schema.integrations.provider, "slack")
        )
      );

    console.log(`✅ Slack channels configured for organization: ${user.organizationId}`);
    console.log(`   Selected channels: ${selectedChannels.join(", ")}`);

    res.json({ success: true, message: "Channel selection saved", selectedChannels });
  } catch (error) {
    console.error("Error configuring Slack channels:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to save channel configuration",
    });
  }
});

/**
 * POST /api/integrations/slack/sync
 * Trigger Slack message sync (fetch, embed, store in Pinecone)
 */
router.post("/slack/sync", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Get user's organization
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Get organization details for logging
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    console.log(`🔄 Starting Slack sync for organization: ${org?.name || user.organizationId}`);

    // Import ingestion service dynamically
    const { ingestionService } = await import("../services/ingestion.service.js");

    // Start sync (runs in background)
    // For now, we'll run it synchronously and return results
    // In production, you might want to use a job queue
    const result = await ingestionService.syncSlackMessages(user.organizationId);

    if (result.success) {
      res.json({
        success: true,
        message: "Sync completed successfully",
        channelsProcessed: result.channelsProcessed,
        messagesEmbedded: result.messagesEmbedded,
        totalMessages: result.totalMessages,
        duration: result.duration,
        errors: result.errors,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Sync Failed",
        message: "Sync completed with errors",
        channelsProcessed: result.channelsProcessed,
        messagesEmbedded: result.messagesEmbedded,
        errors: result.errors,
      });
    }
  } catch (error) {
    console.error("Error triggering Slack sync:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to trigger sync",
    });
  }
});

// ============================================================================
// NOTION INTEGRATION ROUTES
// ============================================================================

/**
 * POST /api/integrations/notion/oauth/start
 * Initiate Notion OAuth flow
 * Returns the authorization URL for the user to visit
 */
router.post(
  "/notion/oauth/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Validate Notion credentials are configured
      if (!config.notion.clientId || !config.notion.clientSecret) {
        res.status(500).json({
          error: "Configuration Error",
          message:
            "Notion OAuth credentials not configured. Please set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.",
        });
        return;
      }

      // Check for placeholder values
      if (
        config.notion.clientId.includes("your-client-id") ||
        config.notion.clientId.includes("example") ||
        config.notion.clientId.length < 20
      ) {
        res.status(500).json({
          error: "Configuration Error",
          message:
            "NOTION_CLIENT_ID appears to be a placeholder value. Please set it to your actual Notion OAuth Client ID from https://www.notion.so/my-integrations",
        });
        return;
      }

      // Get user's organization
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Build Notion OAuth URL
      // Note: Notion doesn't use scopes - user selects pages during OAuth flow
      // Use organizationId as state for security
      const authUrl =
        `https://api.notion.com/v1/oauth/authorize?` +
        `client_id=${config.notion.clientId}&` +
        `response_type=code&` +
        `owner=user&` +
        `redirect_uri=${encodeURIComponent(config.notion.redirectUri)}&` +
        `state=${user.organizationId}`;

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Notion OAuth:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to initiate Notion OAuth",
      });
    }
  }
);

/**
 * GET /api/integrations/notion/callback
 * Notion OAuth callback endpoint
 * Notion redirects here after user approves and selects pages
 */
router.get("/notion/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth error (user denied access)
    if (error) {
      res.status(400).send(`
        <html>
          <head>
            <title>Notion Connection Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #eb5757; }
            </style>
          </head>
          <body>
            <h1>❌ Notion Connection Failed</h1>
            <p>You denied access or an error occurred.</p>
            <p>Error: ${error}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code || !state) {
      res.status(400).send(`
        <html>
          <head>
            <title>Invalid Request</title>
          </head>
          <body>
            <h1>Invalid OAuth callback</h1>
            <p>Missing authorization code or state parameter.</p>
          </body>
        </html>
      `);
      return;
    }

    const organizationId = state as string;

    // Exchange authorization code for access token
    // Notion uses HTTP Basic Authentication
    const encoded = Buffer.from(`${config.notion.clientId}:${config.notion.clientSecret}`).toString(
      "base64"
    );

    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${encoded}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: config.notion.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to exchange code for token: ${errorText}`);
    }

    const data = (await tokenResponse.json()) as NotionOAuthResponse;

    // Notion doesn't provide token expiry time, use estimated lifetime
    const tokenExpiresAt = new Date(
      Date.now() + NOTION_CONFIG.TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // Store integration in database
    await db
      .insert(schema.integrations)
      .values({
        organizationId: organizationId,
        provider: "notion",
        status: "connected",
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenExpiresAt: tokenExpiresAt,
        metadata: {
          bot_id: data.bot_id, // Use as primary key
          workspace_id: data.workspace_id,
          workspace_name: data.workspace_name,
          workspace_icon: data.workspace_icon,
          owner: data.owner,
          duplicated_template_id: data.duplicated_template_id,
        },
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.integrations.organizationId, schema.integrations.provider],
        set: {
          status: "connected",
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          tokenExpiresAt: tokenExpiresAt,
          metadata: {
            bot_id: data.bot_id,
            workspace_id: data.workspace_id,
            workspace_name: data.workspace_name,
            workspace_icon: data.workspace_icon,
            owner: data.owner,
            duplicated_template_id: data.duplicated_template_id,
          },
          updatedAt: new Date(),
        },
      });

    console.log(
      `✅ Notion connected for organization: ${organizationId} (${data.workspace_name || "Workspace"})`
    );

    // Return success page
    res.send(`
      <html>
        <head>
          <title>Notion Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
              color: white;
            }
            .container {
              background: white;
              color: #333;
              border-radius: 10px;
              padding: 40px;
              max-width: 500px;
              margin: 0 auto;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { color: #6366f1; margin-bottom: 10px; }
            p { font-size: 16px; line-height: 1.6; }
            .workspace-name { font-weight: bold; color: #8b5cf6; }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #6366f1;
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
            }
            button:hover { background: #8b5cf6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Notion Connected Successfully!</h1>
            <p>Your workspace <span class="workspace-name">${data.workspace_name || "Notion"}</span> is now connected to Mitable.</p>
            <p>Your selected pages will be synced automatically.</p>
            <p>You can close this window and return to the app.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Auto-close after 1 second
            setTimeout(() => window.close(), 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Notion OAuth callback error:", error);
    res.status(500).send(`
      <html>
        <head>
          <title>Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #eb5757; }
          </style>
        </head>
        <body>
          <h1>❌ Connection Error</h1>
          <p>Failed to connect to Notion. Please try again.</p>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * DELETE /api/integrations/notion/disconnect
 * Disconnect Notion integration
 */
router.delete(
  "/notion/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Get user's organization
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Update integration status to disconnected
      await db
        .update(schema.integrations)
        .set({
          status: "disconnected",
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.integrations.organizationId, user.organizationId),
            eq(schema.integrations.provider, "notion")
          )
        );

      console.log(`✅ Notion disconnected for organization: ${user.organizationId}`);

      res.json({ success: true, message: "Notion integration disconnected" });
    } catch (error) {
      console.error("Error disconnecting Notion:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Notion integration",
      });
    }
  }
);

/**
 * GET /api/integrations/notion/pages
 * List all pages shared with the integration
 */
router.get("/notion/pages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Get user's organization
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Import notion service dynamically
    const { notionService } = await import("../services/notion.service.js");

    const pages = await notionService.searchPages(user.organizationId);

    res.json({ pages });
  } catch (error) {
    console.error("Error fetching Notion pages:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch pages",
    });
  }
});

/**
 * POST /api/integrations/notion/sync
 * Trigger Notion page sync (fetch, embed, store in Pinecone)
 * Note: Unlike Slack, Notion doesn't need a separate configure step
 * Pages are already selected during OAuth flow
 */
router.post("/notion/sync", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Get user's organization
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Get organization details for logging
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    console.log(`🔄 Starting Notion sync for organization: ${org?.name || user.organizationId}`);

    // Import ingestion service dynamically
    const { ingestionService } = await import("../services/ingestion.service.js");

    // Start sync (runs in background)
    const result = await ingestionService.syncNotionPages(user.organizationId);

    if (result.success) {
      res.json({
        success: true,
        message: "Sync completed successfully",
        pagesProcessed: result.channelsProcessed, // Reusing field name
        blocksEmbedded: result.messagesEmbedded,
        totalBlocks: result.totalMessages,
        duration: result.duration,
        errors: result.errors,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Sync Failed",
        message: "Sync completed with errors",
        pagesProcessed: result.channelsProcessed,
        blocksEmbedded: result.messagesEmbedded,
        errors: result.errors,
      });
    }
  } catch (error) {
    console.error("Error triggering Notion sync:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to trigger sync",
    });
  }
});

export default router;
