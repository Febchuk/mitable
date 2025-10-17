import { Router, Request, Response } from "express";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";

const router = Router();

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

// Slack OAuth configuration from environment
const SLACK_CLIENT_ID = config.slack?.clientId || process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = config.slack?.clientSecret || process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI =
  config.slack?.redirectUri || process.env.SLACK_REDIRECT_URI || "http://localhost:3000/api/integrations/slack/callback";

/**
 * POST /api/integrations/slack/oauth/start
 * Initiate Slack OAuth flow
 * Returns the authorization URL for the user to visit
 */
router.post("/slack/oauth/start", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Validate Slack credentials are configured
    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      res.status(500).json({
        error: "Configuration Error",
        message: "Slack OAuth credentials not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.",
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
});

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

    const data = await tokenResponse.json() as SlackOAuthResponse;

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
router.delete("/slack/disconnect", requireAuth, async (req: Request, res: Response): Promise<void> => {
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

    // Update integration status to disconnected
    await db
      .update(schema.integrations)
      .set({
        status: "disconnected",
        accessToken: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.integrations.organizationId, user.organizationId), eq(schema.integrations.provider, "slack"))
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
});

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
        and(eq(schema.integrations.organizationId, user.organizationId), eq(schema.integrations.provider, "slack"))
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
        and(eq(schema.integrations.organizationId, user.organizationId), eq(schema.integrations.provider, "slack"))
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

export default router;
