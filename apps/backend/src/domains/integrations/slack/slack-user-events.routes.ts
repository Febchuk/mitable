import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../auth/middleware/auth.js";
import { config } from "../../../config.js";
import { encryptionService } from "../../auth/services/encryption.service.js";
import { analytics } from "../../shared-infra/lib/analytics.js";

const router = Router();

const SLACK_CLIENT_ID = config.slack.clientId;
const SLACK_CLIENT_SECRET = config.slack.clientSecret;
const SLACK_SIGNING_SECRET = config.slack.signingSecret;

const SLACK_REDIRECT_URI = config.slack.redirectUri;

// ============================================================================
// Slack request signature verification
// ============================================================================

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  const computed = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

// ============================================================================
// OAuth Routes
// ============================================================================

/**
 * POST /api/integrations/slack-user/oauth/start
 * Initiate Slack user-level OAuth flow
 */
router.post("/oauth/start", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      res.status(500).json({
        error: "SLACK_NOT_CONFIGURED",
        message: "Slack OAuth credentials not configured.",
      });
      return;
    }

    const userScopes = ["im:read", "im:history"];

    const authUrl =
      `https://slack.com/oauth/v2/authorize?` +
      `user_scope=${userScopes.join(",")}&` +
      `client_id=${SLACK_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&` +
      `state=${userId}`;

    res.json({ authUrl });
  } catch (error) {
    console.error("Error starting Slack user OAuth:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to initiate Slack user OAuth",
    });
  }
});

/**
 * GET /api/integrations/slack-user/callback
 * Slack OAuth callback — exchanges code for user access token
 */
router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.status(400).send(`
        <html>
          <head><title>Slack Connection Failed</title>
            <style>body{font-family:system-ui,sans-serif;text-align:center;padding:50px}h1{color:#e01e5a}</style>
          </head>
          <body>
            <h1>Slack Connection Failed</h1>
            <p>You denied access or an error occurred: ${error}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!code || !state) {
      res.status(400).send(`
        <html>
          <head><title>Invalid Request</title></head>
          <body><h1>Invalid OAuth callback</h1><p>Missing authorization code or state.</p></body>
        </html>
      `);
      return;
    }

    const userId = state as string;

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

    const data = (await tokenResponse.json()) as {
      ok: boolean;
      error?: string;
      authed_user?: {
        id: string;
        scope: string;
        access_token: string;
        token_type: string;
      };
      team?: { id: string; name: string };
    };

    if (!data.ok || !data.authed_user?.access_token) {
      throw new Error(data.error || "Failed to exchange code for user token");
    }

    const userToken = data.authed_user.access_token;
    const slackUserId = data.authed_user.id;
    const teamId = data.team?.id || "";
    const teamName = data.team?.name || "";

    // Fetch the user's Slack display name
    let displayName = "";
    try {
      const profileRes = await fetch("https://slack.com/api/users.info", {
        headers: { Authorization: `Bearer ${userToken}` },
        method: "POST",
        body: new URLSearchParams({ user: slackUserId }),
      });
      const profileData = (await profileRes.json()) as {
        ok: boolean;
        user?: { real_name?: string; profile?: { display_name?: string } };
      };
      if (profileData.ok && profileData.user) {
        displayName = profileData.user.profile?.display_name || profileData.user.real_name || "";
      }
    } catch {
      // Non-critical — display name can be empty
    }

    const encryptedToken = encryptionService.encrypt(userToken);

    await db
      .update(schema.users)
      .set({
        slackUserAccessTokenEncrypted: encryptedToken,
        slackUserId: slackUserId,
        slackTeamId: teamId,
        slackTeamName: teamName,
        slackUserDisplayName: displayName,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    console.log(`Slack user connected: ${userId} (${displayName || slackUserId} @ ${teamName})`);
    analytics.track(userId, "integration_connected", { integration_type: "slack-user" });

    res.send(`
      <html>
        <head>
          <title>Slack Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex; justify-content: center; align-items: center;
              min-height: 100vh; margin: 0; background: #f8f9fa;
            }
            .card {
              background: white; border-radius: 12px; padding: 48px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; max-width: 420px;
            }
            h1 { color: #1a1a1a; font-size: 20px; margin-bottom: 8px; }
            p { color: #666; font-size: 14px; line-height: 1.5; }
            .team { color: #4A154B; font-weight: 600; }
            button {
              margin-top: 20px; padding: 10px 24px; background: #4A154B; color: white;
              border: none; border-radius: 8px; cursor: pointer; font-size: 14px;
            }
            button:hover { background: #3a1040; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Slack Connected</h1>
            <p>Your account in <span class="team">${teamName}</span> is now connected to Mitable.</p>
            <p>DMs and @mentions will be captured automatically.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Slack user OAuth callback error:", error);
    res.status(500).send(`
      <html>
        <head><title>Connection Error</title>
          <style>body{font-family:system-ui,sans-serif;text-align:center;padding:50px}h1{color:#e01e5a}</style>
        </head>
        <body>
          <h1>Connection Error</h1>
          <p>Failed to connect Slack. Please try again.</p>
          <p>${error instanceof Error ? error.message : "Unknown error"}</p>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/integrations/slack-user/status
 */
router.get("/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({
        slackUserAccessTokenEncrypted: schema.users.slackUserAccessTokenEncrypted,
        slackUserId: schema.users.slackUserId,
        slackTeamName: schema.users.slackTeamName,
        slackUserDisplayName: schema.users.slackUserDisplayName,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    const isConnected = !!user.slackUserAccessTokenEncrypted;

    res.json({
      connected: isConnected,
      expired: false, // Slack user tokens don't expire
      slackUserId: user.slackUserId || null,
      teamName: user.slackTeamName || null,
      displayName: user.slackUserDisplayName || null,
    });
  } catch (error) {
    console.error("Error checking Slack user status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check Slack user status",
    });
  }
});

/**
 * DELETE /api/integrations/slack-user/disconnect
 */
router.delete("/disconnect", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    await db
      .update(schema.users)
      .set({
        slackUserAccessTokenEncrypted: null,
        slackUserTokenExpiresAt: null,
        slackUserId: null,
        slackTeamId: null,
        slackTeamName: null,
        slackUserDisplayName: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    console.log(`Slack user disconnected: ${userId}`);
    analytics.track(userId, "integration_disconnected", { integration_type: "slack-user" });

    res.json({ success: true, message: "Slack disconnected" });
  } catch (error) {
    console.error("Error disconnecting Slack user:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to disconnect Slack",
    });
  }
});

// ============================================================================
// Webhook Endpoint (called by Slack — no auth middleware)
// ============================================================================

/**
 * POST /api/integrations/slack-user/events
 * Receives Slack Event Subscriptions webhooks.
 * Handles url_verification challenge and message.im / app_mention events.
 */
router.post("/events", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawBody = JSON.stringify(req.body);

    // -- Challenge verification (Slack sends this when you register the URL) --
    if (req.body.type === "url_verification") {
      res.json({ challenge: req.body.challenge });
      return;
    }

    // -- Signature verification --
    if (SLACK_SIGNING_SECRET) {
      const timestamp = req.headers["x-slack-request-timestamp"] as string;
      const signature = req.headers["x-slack-signature"] as string;

      if (
        !timestamp ||
        !signature ||
        !verifySlackSignature(SLACK_SIGNING_SECRET, timestamp, rawBody, signature)
      ) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    // Respond immediately — Slack requires a 200 within 3 seconds
    res.status(200).send();

    // -- Process event asynchronously --
    const payload = req.body;
    if (payload.type !== "event_callback") return;

    const event = payload.event;
    if (!event) return;

    const isDM = event.type === "message" && event.channel_type === "im";
    const isMention = event.type === "app_mention";

    if (!isDM && !isMention) return;

    // Ignore bot messages and message edits/deletes
    if (event.subtype) return;

    const senderSlackId = event.user as string;
    const messageText = event.text as string;
    const slackTs = event.ts as string;
    const channelId = event.channel as string;
    const slackEventId = payload.event_id as string;
    const eventTime = new Date((payload.event_time as number) * 1000);

    // Find the Mitable user(s) who have this team connected.
    // For DMs: the recipient is whoever has their Slack user events subscription active
    //          in this team (we find users in the same team who are NOT the sender).
    // For mentions: the app_mention event is dispatched to the app, and we map
    //              it to users in the team.
    const teamId = payload.team_id as string;

    const connectedUsers = await db
      .select({
        id: schema.users.id,
        slackUserId: schema.users.slackUserId,
        slackUserDisplayName: schema.users.slackUserDisplayName,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.slackTeamId, teamId),
          // Only users who have connected their Slack
          eq(schema.users.slackUserAccessTokenEncrypted, schema.users.slackUserAccessTokenEncrypted)
        )
      );

    // Filter to users who actually have a token (non-null)
    const recipients = connectedUsers.filter(
      (u) => u.slackUserId && u.slackUserId !== senderSlackId
    );

    if (recipients.length === 0) return;

    // Resolve sender name (best-effort via any connected user's token)
    let senderName = "";
    const anyConnectedUser = connectedUsers.find((u) => u.slackUserId);
    if (anyConnectedUser) {
      try {
        const [tokenRow] = await db
          .select({ slackUserAccessTokenEncrypted: schema.users.slackUserAccessTokenEncrypted })
          .from(schema.users)
          .where(eq(schema.users.id, anyConnectedUser.id))
          .limit(1);

        if (tokenRow?.slackUserAccessTokenEncrypted) {
          const token = encryptionService.decrypt(tokenRow.slackUserAccessTokenEncrypted);
          const userInfoRes = await fetch("https://slack.com/api/users.info", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ user: senderSlackId }),
          });
          const userInfo = (await userInfoRes.json()) as {
            ok: boolean;
            user?: { real_name?: string; profile?: { display_name?: string } };
          };
          if (userInfo.ok && userInfo.user) {
            senderName = userInfo.user.profile?.display_name || userInfo.user.real_name || "";
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Resolve channel name for mentions
    let channelName = "";
    if (isMention && anyConnectedUser) {
      try {
        const [tokenRow] = await db
          .select({ slackUserAccessTokenEncrypted: schema.users.slackUserAccessTokenEncrypted })
          .from(schema.users)
          .where(eq(schema.users.id, anyConnectedUser.id))
          .limit(1);

        if (tokenRow?.slackUserAccessTokenEncrypted) {
          const token = encryptionService.decrypt(tokenRow.slackUserAccessTokenEncrypted);
          const chanRes = await fetch("https://slack.com/api/conversations.info", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ channel: channelId }),
          });
          const chanInfo = (await chanRes.json()) as {
            ok: boolean;
            channel?: { name?: string };
          };
          if (chanInfo.ok && chanInfo.channel?.name) {
            channelName = chanInfo.channel.name;
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Store one event row per recipient
    for (const recipient of recipients) {
      try {
        await db.insert(schema.slackUserEvents).values({
          userId: recipient.id,
          eventType: isDM ? "dm" : "mention",
          slackEventId: `${slackEventId}_${recipient.id}`,
          senderSlackId,
          senderName: senderName || null,
          recipientSlackId: recipient.slackUserId!,
          recipientName: recipient.slackUserDisplayName || null,
          channelId,
          channelName: channelName || null,
          messageText,
          slackTs,
          eventTimestamp: eventTime,
        });
      } catch (err: any) {
        // Duplicate event_id is expected if Slack retries — ignore
        if (err?.code === "23505") continue;
        console.error(`Failed to store Slack event for user ${recipient.id}:`, err);
      }
    }
  } catch (error) {
    console.error("Slack webhook error:", error);
    if (!res.headersSent) {
      res.status(500).send();
    }
  }
});

export default router;
