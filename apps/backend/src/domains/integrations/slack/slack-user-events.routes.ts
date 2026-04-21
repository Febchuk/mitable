import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth } from "../../auth/middleware/auth.js";
import { config } from "../../../config.js";
import { encryptionService } from "../../auth/services/encryption.service.js";
import { analytics } from "../../shared-infra/lib/analytics.js";

const router = Router();

const SLACK_CLIENT_ID = config.slack.clientId;
const SLACK_CLIENT_SECRET = config.slack.clientSecret;
const SLACK_SIGNING_SECRET = config.slack.signingSecret;

const SLACK_REDIRECT_URI = config.slack.redirectUri;

if (!SLACK_SIGNING_SECRET) {
  console.error(
    "[slack-user-events] SLACK_SIGNING_SECRET is not set — all webhook requests will be rejected until configured."
  );
}

// ============================================================================
// OAuth CSRF state store (nonce → userId, 10-min TTL)
// In a multi-instance deployment, replace with Redis or DB-backed store.
// ============================================================================

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map<string, { userId: string; expiresAt: number }>();

function createOAuthState(userId: string): string {
  const nonce = crypto.randomBytes(32).toString("hex");
  oauthStateStore.set(nonce, { userId, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
  return nonce;
}

function consumeOAuthState(nonce: string): string | null {
  const entry = oauthStateStore.get(nonce);
  if (!entry) return null;
  oauthStateStore.delete(nonce);
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
}

setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of oauthStateStore) {
    if (now > entry.expiresAt) oauthStateStore.delete(nonce);
  }
}, 60_000);

// ============================================================================
// Slack request signature verification
// ============================================================================

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 60 * 5) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  const computed = `v0=${hmac}`;

  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);
  if (computedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(computedBuf, signatureBuf);
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
    const stateNonce = createOAuthState(userId);

    const authUrl =
      `https://slack.com/oauth/v2/authorize?` +
      `user_scope=${userScopes.join(",")}&` +
      `client_id=${SLACK_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&` +
      `state=${encodeURIComponent(stateNonce)}`;

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

    const userId = consumeOAuthState(state as string);
    if (!userId) {
      res.status(403).send(`
        <html>
          <head><title>Invalid State</title>
            <style>body{font-family:system-ui,sans-serif;text-align:center;padding:50px}h1{color:#e01e5a}</style>
          </head>
          <body>
            <h1>Session Expired</h1>
            <p>The OAuth link has expired or was already used. Please try connecting again from Mitable.</p>
          </body>
        </html>
      `);
      return;
    }

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

    console.log(`Slack user connected: userId=${userId}`);
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

    console.log(`Slack user disconnected: userId=${userId}`);
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
// Helpers — per-user Slack API calls
// ============================================================================

async function resolveSlackUserName(token: string, slackUserId: string): Promise<string> {
  const res = await fetch("https://slack.com/api/users.info", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ user: slackUserId }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    user?: { real_name?: string; profile?: { display_name?: string } };
  };
  if (data.ok && data.user) {
    return data.user.profile?.display_name || data.user.real_name || "";
  }
  return "";
}

async function resolveChannelName(token: string, channelId: string): Promise<string> {
  const res = await fetch("https://slack.com/api/conversations.info", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ channel: channelId }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    channel?: { name?: string };
  };
  if (data.ok && data.channel?.name) return data.channel.name;
  return "";
}

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
    // Challenge verification short-circuits before signature check so the
    // endpoint can be registered even if signing secret isn't deployed yet.
    if (req.body.type === "url_verification") {
      res.json({ challenge: req.body.challenge });
      return;
    }

    // -- Signature verification (fail-closed) --
    if (!SLACK_SIGNING_SECRET) {
      console.error("[slack-user-events] Rejecting webhook — SLACK_SIGNING_SECRET not configured");
      res.status(500).json({ error: "Webhook signature verification not configured" });
      return;
    }

    const rawBody = JSON.stringify(req.body);
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

    // Respond immediately — Slack requires a 200 within 3 seconds
    res.status(200).send();

    // -- Process event asynchronously (errors are logged, not swallowed) --
    processSlackEvent(req.body as SlackEventPayload).catch((err) => {
      console.error("[slack-user-events] Async event processing failed:", err);
    });
  } catch (error) {
    console.error("[slack-user-events] Webhook handler error:", error);
    if (!res.headersSent) {
      res.status(500).send();
    }
  }
});

/**
 * Process a verified Slack event_callback payload.
 * Separated from the HTTP handler so errors after the 200 are always logged.
 */
interface SlackEventPayload {
  type: string;
  event?: {
    type: string;
    channel_type?: string;
    subtype?: string;
    user: string;
    text: string;
    ts: string;
    channel: string;
  };
  event_id: string;
  event_time: number;
  authorizations?: Array<{ user_id?: string }>;
}

async function processSlackEvent(payload: SlackEventPayload): Promise<void> {
  if (payload.type !== "event_callback") return;

  const event = payload.event;
  if (!event) return;

  const isDM = event.type === "message" && event.channel_type === "im";
  const isMention = event.type === "app_mention";
  if (!isDM && !isMention) return;
  if (event.subtype) return;

  const senderSlackId = event.user;
  const messageText = event.text;
  const slackTs = event.ts;
  const channelId = event.channel;
  const slackEventId = payload.event_id;
  const eventTime = new Date(payload.event_time * 1000);

  // Route to the specific user(s) Slack authorized this event for,
  // NOT every connected user in the team (prevents cross-user data leak).
  const authorizations = payload.authorizations || [];
  const authorizedSlackUserIds = authorizations
    .map((a) => a.user_id)
    .filter((id): id is string => !!id);

  if (authorizedSlackUserIds.length === 0) return;

  const recipients = await db
    .select({
      id: schema.users.id,
      slackUserId: schema.users.slackUserId,
      slackUserDisplayName: schema.users.slackUserDisplayName,
      slackUserAccessTokenEncrypted: schema.users.slackUserAccessTokenEncrypted,
    })
    .from(schema.users)
    .where(
      and(
        isNotNull(schema.users.slackUserAccessTokenEncrypted),
        isNotNull(schema.users.slackUserId)
      )
    );

  // Only include users who are in the authorizations list and are not the sender
  const targetRecipients = recipients.filter(
    (u) =>
      u.slackUserId &&
      authorizedSlackUserIds.includes(u.slackUserId) &&
      u.slackUserId !== senderSlackId
  );

  if (targetRecipients.length === 0) return;

  // Process per recipient — each uses their own token for API lookups
  for (const recipient of targetRecipients) {
    try {
      let senderName = "";
      let channelName = "";

      if (recipient.slackUserAccessTokenEncrypted) {
        const token = encryptionService.decrypt(recipient.slackUserAccessTokenEncrypted);

        try {
          senderName = await resolveSlackUserName(token, senderSlackId);
        } catch {
          // Non-critical — sender name can be empty
        }

        if (isMention) {
          try {
            channelName = await resolveChannelName(token, channelId);
          } catch {
            // Non-critical
          }
        }
      }

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
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505")
        continue;
      console.error(`[slack-user-events] Failed to store event for user ${recipient.id}:`, err);
    }
  }
}

export default router;
