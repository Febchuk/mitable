import { Router, Request, Response } from "express";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../../auth/middleware/auth.js";
import { config } from "../../../config.js";
import { NOTION_CONFIG } from "../notion/notion.service.js";
import { encryptionService } from "../../auth/services/encryption.service.js";
import { githubService } from "../github/github.service.js";
import { analytics } from "../../shared-infra/lib/analytics.js";

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

// ============================================================================
// Proactive Token Refresh Helpers
// Refresh OAuth tokens when within 1 hour of expiry to prevent "expired" state
// ============================================================================

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Resolve a valid Linear access token, proactively refreshing if near expiry.
 * Returns the decrypted access token or null if refresh fails.
 */
async function resolveLinearAccessToken(
  userId: string,
  user: {
    linearAccessTokenEncrypted: string | null;
    linearRefreshTokenEncrypted?: string | null;
    linearTokenExpiresAt: Date | null;
  }
): Promise<string | null> {
  if (!user.linearAccessTokenEncrypted) return null;

  const isExpiredOrSoon =
    user.linearTokenExpiresAt &&
    new Date(user.linearTokenExpiresAt).getTime() < Date.now() + ONE_HOUR_MS;

  if (isExpiredOrSoon && user.linearRefreshTokenEncrypted) {
    try {
      const { linearService } = await import("../linear/linear.service.js");
      const refreshToken = encryptionService.decrypt(user.linearRefreshTokenEncrypted);
      const newTokenData = await linearService.refreshToken(refreshToken);
      const tokenExpiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);

      await db
        .update(schema.users)
        .set({
          linearAccessTokenEncrypted: encryptionService.encrypt(newTokenData.access_token),
          linearRefreshTokenEncrypted: newTokenData.refresh_token
            ? encryptionService.encrypt(newTokenData.refresh_token)
            : user.linearRefreshTokenEncrypted,
          linearTokenExpiresAt: tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      return newTokenData.access_token;
    } catch (err) {
      console.error(`Linear token refresh failed for user ${userId}:`, err);
      return null;
    }
  }

  return encryptionService.decrypt(user.linearAccessTokenEncrypted);
}

/**
 * Resolve a valid Gmail access token, proactively refreshing if near expiry.
 * Returns the decrypted access token or null if refresh fails.
 */
async function resolveGmailAccessToken(
  userId: string,
  user: {
    gmailAccessTokenEncrypted: string | null;
    gmailRefreshTokenEncrypted?: string | null;
    gmailTokenExpiresAt: Date | null;
  }
): Promise<string | null> {
  if (!user.gmailAccessTokenEncrypted) return null;

  const isExpiredOrSoon =
    user.gmailTokenExpiresAt &&
    new Date(user.gmailTokenExpiresAt).getTime() < Date.now() + ONE_HOUR_MS;

  if (isExpiredOrSoon && user.gmailRefreshTokenEncrypted) {
    try {
      const { gmailService } = await import("../email/gmail.service.js");
      const refreshToken = encryptionService.decrypt(user.gmailRefreshTokenEncrypted);
      const newTokenData = await gmailService.refreshToken(refreshToken);
      const tokenExpiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);

      await db
        .update(schema.users)
        .set({
          gmailAccessTokenEncrypted: encryptionService.encrypt(newTokenData.access_token),
          gmailRefreshTokenEncrypted: newTokenData.refresh_token
            ? encryptionService.encrypt(newTokenData.refresh_token)
            : user.gmailRefreshTokenEncrypted,
          gmailTokenExpiresAt: tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      return newTokenData.access_token;
    } catch (err) {
      console.error(`Gmail token refresh failed for user ${userId}:`, err);
      return null;
    }
  }

  return encryptionService.decrypt(user.gmailAccessTokenEncrypted);
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

// Build redirect URI from environment or use localhost for development
const API_BASE_URL =
  process.env.API_BASE_URL || process.env.VITE_API_URL || "http://localhost:3000";
const SLACK_REDIRECT_URI =
  config.slack?.redirectUri ||
  process.env.SLACK_REDIRECT_URI ||
  `${API_BASE_URL}/api/integrations/slack/callback`;

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
        "chat:write", // Post messages to channels/DMs
        "files:write", // Upload screenshots with session summaries
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

    // Encrypt tokens before storing (SECURITY CRITICAL)
    const encryptedAccessToken = encryptionService.encrypt(data.access_token);

    // Store integration in database
    // Use INSERT ... ON CONFLICT to handle both new connections and reconnections
    await db
      .insert(schema.integrations)
      .values({
        organizationId: organizationId,
        provider: "slack",
        status: "connected",
        accessTokenEncrypted: encryptedAccessToken,
        encryptionVersion: 1,
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
          accessTokenEncrypted: encryptedAccessToken,
          encryptionVersion: 1,
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
    analytics.track(organizationId, "integration_connected", { integration_type: "slack" });

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
          accessTokenEncrypted: "",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.integrations.organizationId, user.organizationId),
            eq(schema.integrations.provider, "slack")
          )
        );

      console.log(`✅ Slack disconnected for organization: ${user.organizationId}`);
      analytics.track(req.userId!, "integration_disconnected", { integration_type: "slack" });

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
    const { slackService } = await import("../slack/slack.service.js");

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
 * GET /api/integrations/slack/users
 * Fetch workspace users for DM delivery
 */
router.get("/slack/users", requireAuth, async (req: Request, res: Response): Promise<void> => {
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
    const { slackService } = await import("../slack/slack.service.js");

    const users = await slackService.listUsers(user.organizationId);

    res.json({ users });
  } catch (error) {
    console.error("Error fetching Slack users:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch users",
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

    // Detect new vs existing channels for smart sync
    const metadata = integration.metadata as any;
    const previousChannels: string[] = metadata?.selected_channels || [];

    const newChannels = selectedChannels.filter((ch: string) => !previousChannels.includes(ch));
    const existingChannels = selectedChannels.filter((ch: string) => previousChannels.includes(ch));
    const removedChannels = previousChannels.filter((ch: string) => !selectedChannels.includes(ch));

    console.log(`📊 Channel changes for organization: ${user.organizationId}`);
    console.log(`   New channels (${newChannels.length}): ${newChannels.join(", ") || "none"}`);
    console.log(
      `   Existing channels (${existingChannels.length}): ${existingChannels.join(", ") || "none"}`
    );
    console.log(
      `   Removed channels (${removedChannels.length}): ${removedChannels.join(", ") || "none"}`
    );

    // Merge selected channels into existing metadata
    const updatedMetadata = {
      ...metadata,
      selected_channels: selectedChannels,
      channel_checkpoints: metadata?.channel_checkpoints || {},
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

    // Auto-trigger smart sync for new AND existing channels
    let syncResult = null;
    const channelsToSync = [...newChannels, ...existingChannels];

    if (channelsToSync.length > 0) {
      console.log(
        `🔄 Smart sync: ${newChannels.length} new, ${existingChannels.length} existing channels`
      );
      try {
        // Import required services
        const { WebClient } = await import("@slack/web-api");
        const { searchContent } = await import("../schema/search-content.schema.js");
        const { desc } = await import("drizzle-orm");

        // Decrypt access token before use
        const accessToken = encryptionService.decrypt(integration.accessTokenEncrypted);
        const client = new WebClient(accessToken);

        let totalNewMessages = 0;
        let channelsProcessed = 0;
        const errors: string[] = [];

        // Process each channel
        for (const channelId of channelsToSync) {
          try {
            const isNewChannel = newChannels.includes(channelId);

            // Get channel info
            const channelInfo = await client.conversations.info({ channel: channelId });
            const channelName = channelInfo.channel?.name || channelId;

            console.log(`  📱 ${channelName} (${isNewChannel ? "new" : "incremental"})`);

            // For existing channels, get last message timestamp
            let oldestTimestamp: string | undefined;
            if (!isNewChannel) {
              const [latestMessage] = await db
                .select({ timestamp: searchContent.timestamp })
                .from(searchContent)
                .where(
                  and(
                    eq(searchContent.organizationId, user.organizationId),
                    eq(searchContent.source, "slack"),
                    eq(searchContent.channelId, channelId)
                  )
                )
                .orderBy(desc(searchContent.timestamp))
                .limit(1);

              if (latestMessage?.timestamp) {
                oldestTimestamp = Math.floor(latestMessage.timestamp / 1000).toString();
                console.log(
                  `     Last sync: ${new Date(latestMessage.timestamp).toLocaleString()}`
                );
              }
            }

            // Fetch messages from Slack
            const result = await client.conversations.history({
              channel: channelId,
              oldest: oldestTimestamp,
              limit: 1000,
            });

            if (!result.ok || !result.messages) {
              errors.push(`Failed to fetch messages from ${channelName}`);
              continue;
            }

            const messages = result.messages;
            console.log(`     Found ${messages.length} new messages`);

            if (messages.length === 0) {
              console.log(`     ✅ Up to date`);
              channelsProcessed++;
              continue;
            }

            // Insert messages into DB
            for (const msg of messages) {
              const msgId = `slack-${channelId}-${msg.ts}-chunk-0`;

              // Check if exists
              const existing = await db
                .select()
                .from(searchContent)
                .where(eq(searchContent.id, msgId))
                .limit(1);

              if (existing.length > 0) continue;

              // Get username
              let username = "Unknown";
              if (msg.user) {
                try {
                  const userInfo = await client.users.info({ user: msg.user });
                  username = userInfo.user?.name || msg.user;
                } catch {
                  username = msg.user;
                }
              }

              // Insert into DB
              await db.insert(searchContent).values({
                id: msgId,
                organizationId: user.organizationId,
                source: "slack",
                sourceType: msg.thread_ts ? "thread_reply" : "message",
                text: msg.text || "",
                textVector: "", // Will be populated by trigger
                channelId,
                channelName,
                userId: msg.user || null,
                username,
                timestamp: Math.floor(parseFloat(msg.ts!) * 1000),
                date: new Date(parseFloat(msg.ts!) * 1000).toISOString().split("T")[0],
              });

              totalNewMessages++;
            }

            console.log(`     ✅ Added ${messages.length} messages`);
            channelsProcessed++;

            // Rate limiting: 350ms between channels
            await new Promise((resolve) => setTimeout(resolve, 350));
          } catch (error) {
            const errorMsg = `Error syncing ${channelId}: ${error instanceof Error ? error.message : "Unknown"}`;
            console.error(`     ❌ ${errorMsg}`);
            errors.push(errorMsg);
          }
        }

        syncResult = {
          success: errors.length === 0,
          channelsProcessed,
          totalMessages: totalNewMessages,
          messagesEmbedded: totalNewMessages,
          errors,
        };

        console.log(
          `✅ Smart sync completed: ${totalNewMessages} messages added across ${channelsProcessed} channels`
        );
      } catch (error) {
        console.error("⚠️  Smart sync failed (non-critical):", error);
        // Don't fail the configure request if sync fails
      }
    }

    res.json({
      success: true,
      message: "Channel selection saved",
      selectedChannels,
      newChannels,
      existingChannels,
      removedChannels,
      autoSyncTriggered: channelsToSync.length > 0,
      syncResult: syncResult
        ? {
            messagesEmbedded: syncResult.messagesEmbedded,
            channelsProcessed: syncResult.channelsProcessed,
            errors: syncResult.errors,
          }
        : null,
    });
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

    // Initialize vector service (required for Pinecone upserts)
    const { vectorService } = await import("../../shared-infra/services/vector.service.js");
    vectorService.initialize();
    console.log("[Integrations] Vector service initialized");

    // Import Slack-specific ingestion service dynamically
    const { slackIngestionService } = await import("../slack/slack-ingestion.service.js");

    // Start sync (runs in background)
    // For now, we'll run it synchronously and return results
    // In production, you might want to use a job queue
    const result = await slackIngestionService.syncMessages(user.organizationId);

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

    // Encrypt tokens before storing (SECURITY CRITICAL)
    const encryptedAccessToken = encryptionService.encrypt(data.access_token);
    const encryptedRefreshToken = encryptionService.encrypt(data.refresh_token);

    // Store integration in database
    await db
      .insert(schema.integrations)
      .values({
        organizationId: organizationId,
        provider: "notion",
        status: "connected",
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        encryptionVersion: 1,
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
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          encryptionVersion: 1,
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
    analytics.track(organizationId, "integration_connected", { integration_type: "notion" });

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
          accessTokenEncrypted: "",
          refreshTokenEncrypted: null,
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
    const { notionService } = await import("../notion/notion.service.js");

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

    // Initialize vector service (required for Pinecone upserts)
    const { vectorService } = await import("../../shared-infra/services/vector.service.js");
    vectorService.initialize();
    console.log("[Integrations] Vector service initialized");

    // Import Notion-specific ingestion service
    const { notionIngestionService } = await import("../notion/notion-ingestion.service.js");

    // Start sync (runs in background)
    const result = await notionIngestionService.syncPages(user.organizationId);

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

// ============================================================================
// GITHUB INTEGRATION ROUTES
// ============================================================================

/**
 * POST /api/integrations/github/install/start
 * Generate GitHub App installation URL
 */
router.post(
  "/github/install/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        sendError(res, 404, "USER_NOT_FOUND", "User not found");
        return;
      }

      if (!config.github?.appSlug) {
        sendError(res, 500, "GITHUB_NOT_CONFIGURED", "GitHub App not configured");
        return;
      }

      const installUrl =
        `https://github.com/apps/${encodeURIComponent(config.github.appSlug)}/installations/new` +
        `?state=${user.organizationId}` +
        `&redirect_uri=${encodeURIComponent(config.github.installationRedirectUri || "")}`;

      res.json({ installUrl });
    } catch (error) {
      console.error("Error starting GitHub install:", error);
      sendError(res, 500, "GITHUB_INSTALL_FAILED", "Failed to start GitHub installation");
    }
  }
);

/**
 * GET /api/integrations/github/callback
 * GitHub App installation callback
 */
router.get("/github/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { installation_id, state } = req.query;

    if (!installation_id || !state) {
      sendError(res, 400, "GITHUB_CALLBACK_INVALID", "Missing installation_id or state");
      return;
    }

    const organizationId = state as string;
    const installationId = parseInt(installation_id as string, 10);

    if (Number.isNaN(installationId)) {
      sendError(res, 400, "GITHUB_INSTALLATION_INVALID", "Invalid installation_id");
      return;
    }

    const placeholderToken = encryptionService.encrypt("github-app-installation");

    const [integration] = await db
      .insert(schema.integrations)
      .values({
        organizationId,
        provider: "github",
        status: "connected",
        accessTokenEncrypted: placeholderToken,
        encryptionVersion: 1,
        metadata: { installationId },
      })
      .onConflictDoUpdate({
        target: [schema.integrations.organizationId, schema.integrations.provider],
        set: {
          status: "connected",
          accessTokenEncrypted: placeholderToken,
          metadata: { installationId },
          updatedAt: new Date(),
        },
      })
      .returning();

    // Fetch and save repos
    try {
      const repos = await githubService.listInstallationRepos(installationId);

      if (repos.length > 0) {
        await db
          .insert(schema.githubRepos)
          .values(
            repos.map((repo) => ({
              integrationId: integration.id,
              githubRepoId: repo.id,
              owner: repo.owner.login,
              name: repo.name,
              fullName: repo.full_name,
              defaultBranch: repo.default_branch,
              visibility: repo.visibility || (repo.private ? "private" : "public"),
              isPrivate: repo.private,
              isSelected: true,
            }))
          )
          .onConflictDoUpdate({
            target: [schema.githubRepos.integrationId, schema.githubRepos.githubRepoId],
            set: {
              owner: sql`excluded.owner`,
              name: sql`excluded.name`,
              fullName: sql`excluded.full_name`,
              defaultBranch: sql`excluded.default_branch`,
              visibility: sql`excluded.visibility`,
              isPrivate: sql`excluded.is_private`,
            },
          });

        console.log(`✅ GitHub repos saved: ${repos.length} for installation ${installationId}`);
      }
    } catch (repoError) {
      console.error("Failed to fetch repos:", repoError);
    }

    analytics.track(organizationId, "integration_connected", { integration_type: "github" });

    res.send(`
      <html>
        <head>
          <title>GitHub Connected</title>
          <style>
            body { font-family: sans-serif; padding: 40px; text-align: center; }
            h1 { color: #24292e; }
          </style>
        </head>
        <body>
          <h1>✅ GitHub Connected</h1>
          <p>Your GitHub App is linked to Mitable.</p>
          <p>You can close this window and return to the app.</p>
          <button onclick="window.close()">Close Window</button>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("GitHub callback error:", error);
    sendError(res, 500, "GITHUB_CALLBACK_FAILED", "Failed to complete GitHub installation");
  }
});

/**
 * GET /api/integrations/github/repos
 * List GitHub repositories
 */
router.get("/github/repos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      sendError(res, 404, "USER_NOT_FOUND", "User not found");
      return;
    }

    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, user.organizationId),
          eq(schema.integrations.provider, "github")
        )
      )
      .limit(1);

    if (!integration) {
      sendError(res, 404, "GITHUB_NOT_CONNECTED", "GitHub not connected");
      return;
    }

    const metadata = (integration.metadata || {}) as { installationId?: number };

    if (!metadata.installationId) {
      sendError(res, 400, "GITHUB_INSTALLATION_MISSING", "Installation ID not found");
      return;
    }

    const repoRecords = await db
      .select()
      .from(schema.githubRepos)
      .where(eq(schema.githubRepos.integrationId, integration.id));

    res.json({
      repositories: repoRecords.map((repo) => ({
        id: repo.githubRepoId,
        name: repo.name,
        fullName: repo.fullName,
        owner: repo.owner,
        defaultBranch: repo.defaultBranch,
        isSelected: repo.isSelected,
      })),
    });
  } catch (error) {
    console.error("Error fetching GitHub repos:", error);
    sendError(res, 500, "GITHUB_REPO_LIST_FAILED", "Failed to fetch repositories");
  }
});

/**
 * POST /api/integrations/github/repos
 * Update selected repositories
 */
router.post("/github/repos", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const { selectedRepoIds } = req.body as { selectedRepoIds?: number[] };

    if (!Array.isArray(selectedRepoIds)) {
      sendError(res, 400, "INVALID_BODY", "selectedRepoIds must be an array");
      return;
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      sendError(res, 404, "USER_NOT_FOUND", "User not found");
      return;
    }

    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, user.organizationId),
          eq(schema.integrations.provider, "github")
        )
      )
      .limit(1);

    if (!integration) {
      sendError(res, 404, "GITHUB_NOT_CONNECTED", "GitHub not connected");
      return;
    }

    await db
      .update(schema.githubRepos)
      .set({ isSelected: false })
      .where(eq(schema.githubRepos.integrationId, integration.id));

    if (selectedRepoIds.length > 0) {
      await db
        .update(schema.githubRepos)
        .set({ isSelected: true })
        .where(
          and(
            eq(schema.githubRepos.integrationId, integration.id),
            inArray(schema.githubRepos.githubRepoId, selectedRepoIds)
          )
        );
    }

    res.json({ success: true, selectedRepoIds });
  } catch (error) {
    console.error("Error saving GitHub repo selections:", error);
    sendError(res, 500, "GITHUB_REPO_SAVE_FAILED", "Failed to save selections");
  }
});

/**
 * POST /api/integrations/github/sync
 * Trigger GitHub sync
 */
router.post("/github/sync", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (!user) {
      sendError(res, 404, "USER_NOT_FOUND", "User not found");
      return;
    }

    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, user.organizationId),
          eq(schema.integrations.provider, "github")
        )
      )
      .limit(1);

    if (!integration) {
      sendError(res, 404, "GITHUB_NOT_CONNECTED", "GitHub not connected");
      return;
    }

    console.log(`🔄 Starting GitHub sync for org: ${user.organizationId}`);

    // Initialize vector service (required for Pinecone upserts)
    const { vectorService } = await import("../../shared-infra/services/vector.service.js");
    vectorService.initialize();
    console.log("[Integrations] Vector service initialized");

    const { syncIntegration } = await import("../../../scripts/sync-github.js");
    const result = await syncIntegration(integration);

    res.json({
      success: true,
      message: "GitHub sync completed",
      reposProcessed: result.reposProcessed,
      commitsProcessed: result.commitsProcessed,
    });
  } catch (error) {
    console.error("Error triggering GitHub sync:", error);
    sendError(res, 500, "GITHUB_SYNC_FAILED", "Failed to sync GitHub");
  }
});

// ============================================================================
// LINEAR INTEGRATION ROUTES (Per-user OAuth for session updates)
// ============================================================================

/**
 * POST /api/integrations/linear/oauth/start
 * Initiate Linear OAuth flow for the current user
 * Returns the authorization URL for the user to visit
 */
router.post(
  "/linear/oauth/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Validate Linear credentials are configured
      if (!config.linear.clientId || !config.linear.clientSecret) {
        sendError(
          res,
          500,
          "LINEAR_NOT_CONFIGURED",
          "Linear OAuth credentials not configured. Please set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET."
        );
        return;
      }

      // Build Linear OAuth URL
      // Scopes: read (view issues), write (create comments, update status)
      const scopes = "read,write";
      const state = userId; // Use userId as state to identify user after redirect

      const authUrl =
        `https://linear.app/oauth/authorize?` +
        `client_id=${config.linear.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.linear.redirectUri)}&` +
        `response_type=code&` +
        `scope=${scopes}&` +
        `state=${state}`;

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Linear OAuth:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to initiate Linear OAuth",
      });
    }
  }
);

/**
 * GET /api/integrations/linear/callback
 * Linear OAuth callback endpoint
 * Linear redirects here after user approves the app
 */
router.get("/linear/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth error (user denied access)
    if (error) {
      res.status(400).send(`
        <html>
          <head>
            <title>Linear Connection Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #5E6AD2; }
            </style>
          </head>
          <body>
            <h1>❌ Linear Connection Failed</h1>
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

    const userId = state as string;

    // Import Linear service
    const { linearService } = await import("../linear/linear.service.js");

    // Exchange authorization code for access token
    const tokenData = await linearService.exchangeCodeForToken(code as string);

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptionService.encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token
      ? encryptionService.encrypt(tokenData.refresh_token)
      : null;

    // Store tokens on user record
    await db
      .update(schema.users)
      .set({
        linearAccessTokenEncrypted: encryptedAccessToken,
        linearRefreshTokenEncrypted: encryptedRefreshToken,
        linearTokenExpiresAt: tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    // Get user info from Linear for logging
    const viewer = await linearService.getViewer(tokenData.access_token);

    console.log(`✅ Linear connected for user: ${userId} (${viewer.email})`);

    // Return success page
    res.send(`
      <html>
        <head>
          <title>Linear Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #5E6AD2 0%, #8B5CF6 100%);
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
            h1 { color: #5E6AD2; margin-bottom: 10px; }
            p { font-size: 16px; line-height: 1.6; }
            .user-name { font-weight: bold; color: #5E6AD2; }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #5E6AD2;
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
            }
            button:hover { background: #4F5ABF; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Linear Connected Successfully!</h1>
            <p>Connected as <span class="user-name">${viewer.displayName || viewer.name}</span></p>
            <p>You can now send session updates to your Linear tickets.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Auto-close after 2 seconds
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Linear OAuth callback error:", error);
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
          <p>Failed to connect to Linear. Please try again.</p>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/integrations/linear/status
 * Check if the current user has Linear connected
 */
router.get("/linear/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        linearAccessTokenEncrypted: schema.users.linearAccessTokenEncrypted,
        linearRefreshTokenEncrypted: schema.users.linearRefreshTokenEncrypted,
        linearTokenExpiresAt: schema.users.linearTokenExpiresAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    // Attempt proactive refresh before reporting expired
    const accessToken = await resolveLinearAccessToken(userId, user);
    const isConnected = !!user.linearAccessTokenEncrypted;
    const isExpired = !accessToken && isConnected;

    res.json({
      connected: isConnected && !isExpired,
      expired: isExpired,
    });
  } catch (error) {
    console.error("Error checking Linear status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check Linear status",
    });
  }
});

/**
 * DELETE /api/integrations/linear/disconnect
 * Disconnect Linear for the current user
 */
router.delete(
  "/linear/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      await db
        .update(schema.users)
        .set({
          linearAccessTokenEncrypted: null,
          linearRefreshTokenEncrypted: null,
          linearTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      console.log(`✅ Linear disconnected for user: ${userId}`);

      res.json({ success: true, message: "Linear disconnected" });
    } catch (error) {
      console.error("Error disconnecting Linear:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Linear",
      });
    }
  }
);

/**
 * GET /api/integrations/linear/issues
 * Get the current user's assigned Linear issues
 */
router.get("/linear/issues", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        linearAccessTokenEncrypted: schema.users.linearAccessTokenEncrypted,
        linearRefreshTokenEncrypted: schema.users.linearRefreshTokenEncrypted,
        linearTokenExpiresAt: schema.users.linearTokenExpiresAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.linearAccessTokenEncrypted) {
      res.status(400).json({
        error: "Linear Not Connected",
        message: "Please connect your Linear account first",
      });
      return;
    }

    // Resolve token (proactively refreshes if near expiry)
    const accessToken = await resolveLinearAccessToken(userId, user);
    if (!accessToken) {
      res.status(401).json({
        error: "Token Expired",
        message: "Your Linear connection has expired. Please reconnect.",
      });
      return;
    }

    // Fetch issues from Linear
    const { linearService } = await import("../linear/linear.service.js");
    const issues = await linearService.getAssignedIssues(accessToken);

    res.json({ issues });
  } catch (error) {
    console.error("Error fetching Linear issues:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch issues",
    });
  }
});

/**
 * GET /api/integrations/linear/teams
 * Get teams and workflow states for the current user
 */
router.get("/linear/teams", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        linearAccessTokenEncrypted: schema.users.linearAccessTokenEncrypted,
        linearRefreshTokenEncrypted: schema.users.linearRefreshTokenEncrypted,
        linearTokenExpiresAt: schema.users.linearTokenExpiresAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.linearAccessTokenEncrypted) {
      res.status(400).json({
        error: "Linear Not Connected",
        message: "Please connect your Linear account first",
      });
      return;
    }

    // Resolve token (proactively refreshes if near expiry)
    const accessToken = await resolveLinearAccessToken(userId, user);
    if (!accessToken) {
      res.status(401).json({
        error: "Token Expired",
        message: "Your Linear connection has expired. Please reconnect.",
      });
      return;
    }

    // Fetch teams from Linear
    const { linearService } = await import("../linear/linear.service.js");
    const teams = await linearService.getTeams(accessToken);

    res.json({ teams });
  } catch (error) {
    console.error("Error fetching Linear teams:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch teams",
    });
  }
});

/**
 * POST /api/integrations/linear/issues/:issueId/comment
 * Create a comment on a Linear issue
 */
router.post(
  "/linear/issues/:issueId/comment",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { issueId } = req.params;
      const { body } = req.body;

      if (!body) {
        res.status(400).json({
          error: "Bad Request",
          message: "Comment body is required",
        });
        return;
      }

      const [user] = await db
        .select({
          linearAccessTokenEncrypted: schema.users.linearAccessTokenEncrypted,
          linearRefreshTokenEncrypted: schema.users.linearRefreshTokenEncrypted,
          linearTokenExpiresAt: schema.users.linearTokenExpiresAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user?.linearAccessTokenEncrypted) {
        res.status(400).json({
          error: "Linear Not Connected",
          message: "Please connect your Linear account first",
        });
        return;
      }

      // Resolve token (proactively refreshes if near expiry)
      const accessToken = await resolveLinearAccessToken(userId, user);
      if (!accessToken) {
        res.status(401).json({
          error: "Token Expired",
          message: "Your Linear connection has expired. Please reconnect.",
        });
        return;
      }

      // Create comment on Linear
      const { linearService } = await import("../linear/linear.service.js");
      const result = await linearService.createComment(accessToken, issueId, body);

      console.log(`✅ Comment created on Linear issue ${issueId} by user ${userId}`);

      res.json(result);
    } catch (error) {
      console.error("Error creating Linear comment:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to create comment",
      });
    }
  }
);

/**
 * PATCH /api/integrations/linear/issues/:issueId/state
 * Update an issue's workflow state
 */
router.patch(
  "/linear/issues/:issueId/state",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { issueId } = req.params;
      const { stateId } = req.body;

      if (!stateId) {
        res.status(400).json({
          error: "Bad Request",
          message: "stateId is required",
        });
        return;
      }

      const [user] = await db
        .select({
          linearAccessTokenEncrypted: schema.users.linearAccessTokenEncrypted,
          linearRefreshTokenEncrypted: schema.users.linearRefreshTokenEncrypted,
          linearTokenExpiresAt: schema.users.linearTokenExpiresAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user?.linearAccessTokenEncrypted) {
        res.status(400).json({
          error: "Linear Not Connected",
          message: "Please connect your Linear account first",
        });
        return;
      }

      // Resolve token (proactively refreshes if near expiry)
      const accessToken = await resolveLinearAccessToken(userId, user);
      if (!accessToken) {
        res.status(401).json({
          error: "Token Expired",
          message: "Your Linear connection has expired. Please reconnect.",
        });
        return;
      }

      // Update issue state on Linear
      const { linearService } = await import("../linear/linear.service.js");
      const result = await linearService.updateIssueState(accessToken, issueId, stateId);

      console.log(`✅ Linear issue ${issueId} state updated by user ${userId}`);

      res.json(result);
    } catch (error) {
      console.error("Error updating Linear issue state:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to update issue state",
      });
    }
  }
);

// ============================================================================
// GMAIL INTEGRATION ROUTES (Per-user OAuth for email sending)
// ============================================================================

/**
 * POST /api/integrations/gmail/oauth/start
 * Initiate Gmail OAuth flow for the current user
 * Returns the authorization URL for the user to visit
 */
router.post(
  "/gmail/oauth/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Import Gmail service
      const { gmailService } = await import("../email/gmail.service.js");

      // Validate Gmail credentials are configured
      if (!gmailService.isConfigured()) {
        sendError(
          res,
          500,
          "GMAIL_NOT_CONFIGURED",
          "Gmail OAuth credentials not configured. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET."
        );
        return;
      }

      // Get auth URL with userId as state
      const authUrl = gmailService.getAuthUrl(userId);

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Gmail OAuth:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to initiate Gmail OAuth",
      });
    }
  }
);

/**
 * GET /api/integrations/gmail/callback
 * Gmail OAuth callback endpoint
 * Google redirects here after user approves the app
 */
router.get("/gmail/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth error (user denied access)
    if (error) {
      res.status(400).send(`
        <html>
          <head>
            <title>Gmail Connection Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #EA4335; }
            </style>
          </head>
          <body>
            <h1>Gmail Connection Failed</h1>
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

    const userId = state as string;

    // Import Gmail service
    const { gmailService } = await import("../email/gmail.service.js");

    // Exchange authorization code for access token
    const tokenData = await gmailService.exchangeCodeForToken(code as string);

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Get user's Gmail email
    const profile = await gmailService.getProfile(tokenData.access_token);

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptionService.encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token
      ? encryptionService.encrypt(tokenData.refresh_token)
      : null;

    // Store tokens on user record
    await db
      .update(schema.users)
      .set({
        gmailAccessTokenEncrypted: encryptedAccessToken,
        gmailRefreshTokenEncrypted: encryptedRefreshToken,
        gmailTokenExpiresAt: tokenExpiresAt,
        gmailUserEmail: profile.emailAddress,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    console.log(`Gmail connected for user: ${userId} (${profile.emailAddress})`);

    // Return success page
    res.send(`
      <html>
        <head>
          <title>Gmail Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #EA4335 0%, #FBBC05 50%, #34A853 100%);
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
            h1 { color: #34A853; margin-bottom: 10px; }
            p { font-size: 16px; line-height: 1.6; }
            .user-email { font-weight: bold; color: #4285F4; }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #4285F4;
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
            }
            button:hover { background: #3367D6; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Gmail Connected Successfully!</h1>
            <p>Connected as <span class="user-email">${profile.emailAddress}</span></p>
            <p>You can now send session summaries via email.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Auto-close after 2 seconds
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    res.status(500).send(`
      <html>
        <head>
          <title>Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #EA4335; }
          </style>
        </head>
        <body>
          <h1>Connection Error</h1>
          <p>Failed to connect to Gmail. Please try again.</p>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/integrations/gmail/status
 * Check if the current user has Gmail connected
 */
router.get("/gmail/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        gmailAccessTokenEncrypted: schema.users.gmailAccessTokenEncrypted,
        gmailRefreshTokenEncrypted: schema.users.gmailRefreshTokenEncrypted,
        gmailTokenExpiresAt: schema.users.gmailTokenExpiresAt,
        gmailUserEmail: schema.users.gmailUserEmail,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    // Attempt proactive refresh before reporting expired
    const accessToken = await resolveGmailAccessToken(userId, user);
    const isConnected = !!user.gmailAccessTokenEncrypted;
    const isExpired = !accessToken && isConnected;

    res.json({
      connected: isConnected && !isExpired,
      expired: isExpired,
      email: user.gmailUserEmail || null,
    });
  } catch (error) {
    console.error("Error checking Gmail status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check Gmail status",
    });
  }
});

/**
 * DELETE /api/integrations/gmail/disconnect
 * Disconnect Gmail for the current user
 */
router.delete(
  "/gmail/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      await db
        .update(schema.users)
        .set({
          gmailAccessTokenEncrypted: null,
          gmailRefreshTokenEncrypted: null,
          gmailTokenExpiresAt: null,
          gmailUserEmail: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      console.log(`Gmail disconnected for user: ${userId}`);

      res.json({ success: true, message: "Gmail disconnected" });
    } catch (error) {
      console.error("Error disconnecting Gmail:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Gmail",
      });
    }
  }
);

/**
 * POST /api/integrations/gmail/send
 * Send an email via the user's Gmail account
 */
router.post("/gmail/send", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { to, subject, body } = req.body;

    // Validate required fields
    if (!to || !subject || !body) {
      sendError(res, 400, "MISSING_FIELDS", "Missing required fields: to, subject, body");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      sendError(res, 400, "INVALID_EMAIL", "Invalid email address format");
      return;
    }

    const [user] = await db
      .select({
        gmailAccessTokenEncrypted: schema.users.gmailAccessTokenEncrypted,
        gmailRefreshTokenEncrypted: schema.users.gmailRefreshTokenEncrypted,
        gmailTokenExpiresAt: schema.users.gmailTokenExpiresAt,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.gmailAccessTokenEncrypted) {
      sendError(res, 400, "GMAIL_NOT_CONNECTED", "Please connect your Gmail account first");
      return;
    }

    // Import Gmail service
    const { gmailService } = await import("../email/gmail.service.js");

    // Resolve token (proactively refreshes if near expiry)
    const accessToken = await resolveGmailAccessToken(userId, user);
    if (!accessToken) {
      sendError(res, 401, "TOKEN_EXPIRED", "Your Gmail connection has expired. Please reconnect.");
      return;
    }

    // Send email
    const fromName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.firstName || undefined;

    const result = await gmailService.sendEmail(accessToken, to, subject, body, fromName);

    console.log(`Email sent via Gmail for user ${userId} to ${to}`);

    res.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId,
    });
  } catch (error) {
    console.error("Error sending email via Gmail:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to send email",
    });
  }
});

// ============================================================================
// NOTION USER INTEGRATION ROUTES (Per-user OAuth for document exports)
// ============================================================================

/**
 * POST /api/integrations/notion/user/oauth/start
 * Initiate Notion OAuth flow for the current user
 * Returns the authorization URL for the user to visit
 */
router.post(
  "/notion/user/oauth/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Validate Notion credentials are configured
      if (!config.notion.clientId || !config.notion.clientSecret) {
        sendError(
          res,
          500,
          "NOTION_NOT_CONFIGURED",
          "Notion OAuth credentials not configured. Please set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET."
        );
        return;
      }

      // Build Notion OAuth URL
      // owner=user allows user to select pages from their workspace
      const state = userId; // Use userId as state to identify user after redirect

      console.log(`[Notion User OAuth] Starting OAuth for user ${userId}`);
      console.log(`[Notion User OAuth] Using redirect URI: ${config.notion.userRedirectUri}`);

      const authUrl =
        `https://api.notion.com/v1/oauth/authorize?` +
        `client_id=${config.notion.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.notion.userRedirectUri)}&` +
        `response_type=code&` +
        `owner=user&` +
        `state=${state}`;

      console.log(`[Notion User OAuth] Generated auth URL: ${authUrl}`);

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Notion user OAuth:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to initiate Notion OAuth",
      });
    }
  }
);

/**
 * GET /api/integrations/notion/user/callback
 * Notion OAuth callback endpoint
 * Notion redirects here after user approves the app
 */
router.get("/notion/user/callback", async (req: Request, res: Response): Promise<void> => {
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
              h1 { color: #000; }
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

    const userId = state as string;

    // Import Notion user OAuth service
    const { notionUserOAuthService } = await import("../notion/notion-user-oauth.service.js");

    // Exchange authorization code for access token
    const tokenData = await notionUserOAuthService.exchangeCodeForToken(code as string);

    // Notion tokens don't have expiration in response, but they can be refreshed
    // We'll set a reasonable expiration time (90 days as per Notion docs)
    const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptionService.encrypt(tokenData.access_token);

    // Note: Notion doesn't return refresh_token in initial exchange, only on refresh
    // We'll store null initially and it will be populated on first refresh
    const encryptedRefreshToken = null;

    // Store tokens on user record
    await db
      .update(schema.users)
      .set({
        notionAccessTokenEncrypted: encryptedAccessToken,
        notionRefreshTokenEncrypted: encryptedRefreshToken,
        notionTokenExpiresAt: tokenExpiresAt,
        notionWorkspaceId: tokenData.workspace_id,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    // Get user info for logging
    const userName = tokenData.owner.user?.person.email || tokenData.owner.user?.name || "User";

    console.log(
      `✅ Notion connected for user: ${userId} (${userName}) - Workspace: ${tokenData.workspace_name}`
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
              background: linear-gradient(135deg, #000 0%, #37352F 100%);
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
            h1 { color: #000; margin-bottom: 10px; }
            p { font-size: 16px; line-height: 1.6; }
            .workspace-name { font-weight: bold; color: #000; }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #000;
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
            }
            button:hover { background: #37352F; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Notion Connected Successfully!</h1>
            <p>Connected to workspace: <span class="workspace-name">${tokenData.workspace_name}</span></p>
            <p>You can now export documents to your Notion workspace.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Auto-close after 2 seconds
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Notion user OAuth callback error:", error);
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
          <p>Failed to connect to Notion. Please try again.</p>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/integrations/notion/user/status
 * Check if the current user has Notion connected
 */
router.get(
  "/notion/user/status",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      const [user] = await db
        .select({
          notionAccessTokenEncrypted: schema.users.notionAccessTokenEncrypted,
          notionTokenExpiresAt: schema.users.notionTokenExpiresAt,
          notionWorkspaceId: schema.users.notionWorkspaceId,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: "Not Found", message: "User not found" });
        return;
      }

      const isConnected = !!user.notionAccessTokenEncrypted;
      const isExpired = user.notionTokenExpiresAt
        ? new Date(user.notionTokenExpiresAt) < new Date()
        : false;

      res.json({
        connected: isConnected && !isExpired,
        expired: isExpired,
        workspaceId: user.notionWorkspaceId,
      });
    } catch (error) {
      console.error("Error checking Notion user status:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check Notion status",
      });
    }
  }
);

/**
 * DELETE /api/integrations/notion/user/disconnect
 * Disconnect Notion for the current user
 */
router.delete(
  "/notion/user/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      await db
        .update(schema.users)
        .set({
          notionAccessTokenEncrypted: null,
          notionRefreshTokenEncrypted: null,
          notionTokenExpiresAt: null,
          notionWorkspaceId: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      console.log(`✅ Notion disconnected for user: ${userId}`);

      res.json({ success: true, message: "Notion disconnected" });
    } catch (error) {
      console.error("Error disconnecting Notion user:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Notion",
      });
    }
  }
);

// ============================================================================
// GRANOLA INTEGRATION ROUTES (Per-user OAuth for meeting notes sync)
// ============================================================================

/**
 * POST /api/integrations/granola/oauth/start
 * Initiate Granola OAuth flow for the current user
 * Returns the authorization URL for the user to visit
 */
router.post(
  "/granola/oauth/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      const { granolaService } = await import("../granola/granola.service.js");

      if (!granolaService.isConfigured()) {
        sendError(
          res,
          500,
          "GRANOLA_NOT_CONFIGURED",
          "Granola MCP integration not configured. Please set GRANOLA_MCP_BASE_URL."
        );
        return;
      }

      const authUrl = await granolaService.getAuthUrl(userId);

      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting Granola OAuth:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to initiate Granola OAuth",
      });
    }
  }
);

/**
 * GET /api/integrations/granola/callback
 * Granola OAuth callback endpoint
 * Granola redirects here after user approves the app
 */
router.get("/granola/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.status(400).send(`
        <html>
          <head>
            <title>Granola Connection Failed</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #e01e5a; }
            </style>
          </head>
          <body>
            <h1>Granola Connection Failed</h1>
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

    const userId = state as string;

    const { granolaService } = await import("../granola/granola.service.js");

    // Exchange authorization code for access token
    const tokenData = await granolaService.exchangeCodeForToken(code as string, userId);

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Encrypt tokens before storing
    const encryptedAccessToken = encryptionService.encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token
      ? encryptionService.encrypt(tokenData.refresh_token)
      : null;

    // Persist the client_id used during this authorization — needed for token refresh
    // (dynamic registration creates a new client_id on each server restart)
    const clientReg = await granolaService.ensureClientRegistration();

    // Store tokens + client_id on user record
    await db
      .update(schema.users)
      .set({
        granolaAccessTokenEncrypted: encryptedAccessToken,
        granolaRefreshTokenEncrypted: encryptedRefreshToken,
        granolaTokenExpiresAt: tokenExpiresAt,
        granolaOAuthClientId: clientReg.client_id,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    console.log(`Granola connected for user: ${userId}`);

    // Return success page
    res.send(`
      <html>
        <head>
          <title>Granola Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
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
            h1 { color: #16213e; margin-bottom: 10px; }
            p { font-size: 16px; line-height: 1.6; }
            button {
              margin-top: 20px;
              padding: 12px 24px;
              background: #16213e;
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
            }
            button:hover { background: #1a1a2e; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Granola Connected Successfully!</h1>
            <p>Your meeting notes will now sync to Mitable.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Granola OAuth callback error:", error);
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
          <h1>Connection Error</h1>
          <p>Failed to connect to Granola. Please try again.</p>
          <p>Error: ${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/integrations/granola/status
 * Check if the current user has Granola connected
 */
router.get("/granola/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        granolaAccessTokenEncrypted: schema.users.granolaAccessTokenEncrypted,
        granolaTokenExpiresAt: schema.users.granolaTokenExpiresAt,
        granolaUserEmail: schema.users.granolaUserEmail,
        granolaLastSyncedAt: schema.users.granolaLastSyncedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    const isConnected = !!user.granolaAccessTokenEncrypted;
    const isExpired = user.granolaTokenExpiresAt
      ? new Date(user.granolaTokenExpiresAt) < new Date()
      : false;

    res.json({
      connected: isConnected && !isExpired,
      expired: isExpired,
      email: user.granolaUserEmail || null,
      lastSyncedAt: user.granolaLastSyncedAt || null,
    });
  } catch (error) {
    console.error("Error checking Granola status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check Granola status",
    });
  }
});

/**
 * DELETE /api/integrations/granola/disconnect
 * Disconnect Granola for the current user
 */
router.delete(
  "/granola/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      await db
        .update(schema.users)
        .set({
          granolaAccessTokenEncrypted: null,
          granolaRefreshTokenEncrypted: null,
          granolaTokenExpiresAt: null,
          granolaOAuthClientId: null,
          granolaUserEmail: null,
          granolaLastSyncedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      console.log(`Granola disconnected for user: ${userId}`);

      res.json({ success: true, message: "Granola disconnected" });
    } catch (error) {
      console.error("Error disconnecting Granola:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Granola",
      });
    }
  }
);

/**
 * POST /api/integrations/granola/sync
 * Trigger a manual sync of Granola notes for the current user
 */
router.post("/granola/sync", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const { granolaSyncService } = await import("../granola/granola-sync.service.js");

    const result = await granolaSyncService.syncUserMeetings(userId);

    console.log(
      `Granola sync for user ${userId}: ${result.meetingsProcessed} meetings, ` +
        `${result.blocksCreated} created, ${result.blocksUpdated} updated`
    );

    res.json(result);
  } catch (error) {
    console.error("Error syncing Granola notes:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to sync Granola notes",
    });
  }
});

/**
 * GET /api/integrations/granola/notes
 * List recent Granola notes for the current user (preview, not full sync)
 */
router.get("/granola/notes", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        granolaAccessTokenEncrypted: schema.users.granolaAccessTokenEncrypted,
        granolaRefreshTokenEncrypted: schema.users.granolaRefreshTokenEncrypted,
        granolaTokenExpiresAt: schema.users.granolaTokenExpiresAt,
        granolaOAuthClientId: schema.users.granolaOAuthClientId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.granolaAccessTokenEncrypted) {
      sendError(res, 400, "GRANOLA_NOT_CONNECTED", "Please connect your Granola account first");
      return;
    }

    // Check token expiry
    if (user.granolaTokenExpiresAt && new Date(user.granolaTokenExpiresAt) < new Date()) {
      if (!user.granolaRefreshTokenEncrypted) {
        sendError(
          res,
          401,
          "TOKEN_EXPIRED",
          "Your Granola connection has expired. Please reconnect."
        );
        return;
      }

      // Attempt refresh — use the stored client_id (not dynamic re-registration)
      try {
        const { granolaService } = await import("../granola/granola.service.js");
        const refreshToken = encryptionService.decrypt(user.granolaRefreshTokenEncrypted);
        const newTokenData = await granolaService.refreshToken(
          refreshToken,
          user.granolaOAuthClientId ?? undefined
        );

        const tokenExpiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);
        await db
          .update(schema.users)
          .set({
            granolaAccessTokenEncrypted: encryptionService.encrypt(newTokenData.access_token),
            granolaRefreshTokenEncrypted: newTokenData.refresh_token
              ? encryptionService.encrypt(newTokenData.refresh_token)
              : user.granolaRefreshTokenEncrypted,
            granolaTokenExpiresAt: tokenExpiresAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, userId));

        // Use new token
        const { granolaService: svc } = await import("../granola/granola.service.js");
        const meetings = await svc.listMeetings(newTokenData.access_token, "last_30_days");
        res.json(meetings);
        return;
      } catch (refreshError) {
        const msg = refreshError instanceof Error ? refreshError.message : String(refreshError);

        // Permanent failure — clear tokens so the UI shows "disconnected"
        if (msg.includes("invalid_refresh_token") || msg.includes("invalid_grant")) {
          await db
            .update(schema.users)
            .set({
              granolaAccessTokenEncrypted: null,
              granolaRefreshTokenEncrypted: null,
              granolaTokenExpiresAt: null,
              granolaOAuthClientId: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.users.id, userId));
        }

        sendError(res, 401, "REFRESH_FAILED", "Failed to refresh Granola token. Please reconnect.");
        return;
      }
    }

    const accessToken = encryptionService.decrypt(user.granolaAccessTokenEncrypted);

    const { granolaService } = await import("../granola/granola.service.js");
    const meetings = await granolaService.listMeetings(accessToken, "last_30_days");

    res.json(meetings);
  } catch (error) {
    console.error("Error fetching Granola notes:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch notes",
    });
  }
});

/**
 * GET /api/integrations/granola/blocks
 * Return Granola activity_blocks for the current user (for calendar view)
 * Admins can pass ?userId=<id> to fetch blocks for any user
 */
router.get("/granola/blocks", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    let userId = req.userId!;

    // Allow admins to query blocks for a specific user
    if (req.query.userId && typeof req.query.userId === "string") {
      const requestingUser = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, req.userId!))
        .limit(1);
      if (requestingUser[0]?.role !== "admin") {
        res.status(403).json({ error: "Only admins can query other users' blocks" });
        return;
      }
      userId = req.query.userId;
    }

    const blocks = await db
      .select({
        id: schema.activityBlocks.id,
        name: schema.activityBlocks.name,
        startTime: schema.activityBlocks.startTime,
        endTime: schema.activityBlocks.endTime,
        durationMinutes: schema.activityBlocks.durationMinutes,
        description: schema.activityBlocks.description,
        category: schema.activityBlocks.category,
        topicName: schema.activityBlocks.topicName,
        subscriberName: schema.activityBlocks.subscriberName,
        participants: schema.activityBlocks.participants,
      })
      .from(schema.activityBlocks)
      .where(
        and(
          eq(schema.activityBlocks.userId, userId),
          eq(schema.activityBlocks.blockType, "granola")
        )
      )
      .orderBy(schema.activityBlocks.startTime);

    res.json({ blocks });
  } catch (error) {
    console.error("Error fetching Granola blocks:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch Granola blocks",
    });
  }
});

// ============================================================================
// FIREFLIES AI INTEGRATION ROUTES (Per-user API key for meeting transcript sync)
// ============================================================================

/**
 * POST /api/integrations/fireflies/connect
 * Save the user's Fireflies API key (validates it first).
 */
router.post(
  "/fireflies/connect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { apiKey } = req.body as { apiKey?: string };

      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
        sendError(res, 400, "INVALID_API_KEY", "Please provide a valid Fireflies API key.");
        return;
      }

      // Validate the key by fetching user profile
      const { firefliesService } = await import("../fireflies/fireflies.service.js");
      let ffUser;
      try {
        ffUser = await firefliesService.validateApiKey(apiKey.trim());
      } catch (err) {
        sendError(
          res,
          401,
          "INVALID_API_KEY",
          "The API key is invalid or expired. Please check your Fireflies settings.",
          { detail: String(err) }
        );
        return;
      }

      // Encrypt and store
      const encrypted = encryptionService.encrypt(apiKey.trim());

      await db
        .update(schema.users)
        .set({
          firefliesApiKeyEncrypted: encrypted,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      console.log(`Fireflies connected for user: ${userId} (${ffUser.email})`);

      res.json({
        success: true,
        message: "Fireflies connected successfully",
        email: ffUser.email,
        name: ffUser.name,
      });
    } catch (error) {
      console.error("Error connecting Fireflies:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to connect Fireflies",
      });
    }
  }
);

/**
 * GET /api/integrations/fireflies/status
 * Check if the current user has Fireflies connected.
 */
router.get("/fireflies/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        firefliesApiKeyEncrypted: schema.users.firefliesApiKeyEncrypted,
        firefliesLastSyncedAt: schema.users.firefliesLastSyncedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const connected = !!user?.firefliesApiKeyEncrypted;

    res.json({
      connected,
      lastSyncedAt: user?.firefliesLastSyncedAt || null,
    });
  } catch (error) {
    console.error("Error checking Fireflies status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check Fireflies status",
    });
  }
});

/**
 * DELETE /api/integrations/fireflies/disconnect
 * Disconnect Fireflies for the current user.
 */
router.delete(
  "/fireflies/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      await db
        .update(schema.users)
        .set({
          firefliesApiKeyEncrypted: null,
          firefliesLastSyncedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      console.log(`Fireflies disconnected for user: ${userId}`);

      res.json({ success: true, message: "Fireflies disconnected" });
    } catch (error) {
      console.error("Error disconnecting Fireflies:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect Fireflies",
      });
    }
  }
);

/**
 * POST /api/integrations/fireflies/sync
 * Trigger a manual sync for the current user.
 */
router.post("/fireflies/sync", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const { firefliesSyncService } = await import("../fireflies/fireflies-sync.service.js");
    const result = await firefliesSyncService.syncUserMeetings(userId);

    res.json({
      success: true,
      meetingsProcessed: result.meetingsProcessed,
      meetingsCreated: result.meetingsCreated,
      meetingsUpdated: result.meetingsUpdated,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error syncing Fireflies:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to sync Fireflies meetings",
    });
  }
});

/**
 * GET /api/integrations/fireflies/blocks
 * Return Fireflies activity_blocks for the current user (for calendar view).
 * Admins can pass ?userId=<id> to fetch blocks for any user.
 */
router.get("/fireflies/blocks", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    let userId = req.userId!;

    if (req.query.userId && typeof req.query.userId === "string") {
      const requestingUser = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, req.userId!))
        .limit(1);
      if (requestingUser[0]?.role !== "admin") {
        res.status(403).json({ error: "Only admins can query other users' blocks" });
        return;
      }
      userId = req.query.userId;
    }

    const blocks = await db
      .select({
        id: schema.activityBlocks.id,
        name: schema.activityBlocks.name,
        startTime: schema.activityBlocks.startTime,
        endTime: schema.activityBlocks.endTime,
        durationMinutes: schema.activityBlocks.durationMinutes,
        description: schema.activityBlocks.description,
        category: schema.activityBlocks.category,
        topicName: schema.activityBlocks.topicName,
        subscriberName: schema.activityBlocks.subscriberName,
        participants: schema.activityBlocks.participants,
      })
      .from(schema.activityBlocks)
      .where(
        and(
          eq(schema.activityBlocks.userId, userId),
          eq(schema.activityBlocks.blockType, "fireflies")
        )
      )
      .orderBy(schema.activityBlocks.startTime);

    res.json({ blocks });
  } catch (error) {
    console.error("Error fetching Fireflies blocks:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch Fireflies blocks",
    });
  }
});

export default router;
