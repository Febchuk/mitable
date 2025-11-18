#!/usr/bin/env tsx
/**
 * Quick Slack Sync - Recent Messages Only
 *
 * Fetches messages from the last 7 days to quickly catch up
 *
 * Usage:
 *   npm run sync-slack-recent <organizationId>
 */

import { WebClient } from "@slack/web-api";
import { db } from "../db/client";
import { integrations, searchContent } from "../db/schema";
import { sql } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import { vectorService } from "../services/vector.service.js";
import { validateConfig } from "../config.js";
import { encryptionService } from "../services/encryption.service.js";

async function main() {
  validateConfig();
  vectorService.initialize();

  const orgId = process.argv[2] || "org-86c996f4-d997-44cf-8bdf-b00607e619ee";

  console.log(`\n🚀 Quick sync - fetching messages from last 7 days for org: ${orgId}\n`);

  // Get Slack integration
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.organizationId, orgId), eq(integrations.provider, "slack")))
    .limit(1);

  if (!integration) {
    console.error("❌ No Slack integration found");
    process.exit(1);
  }

  const metadata = integration.metadata as any;

  if (!integration.accessTokenEncrypted) {
    console.error("❌ No access token found for Slack integration");
    process.exit(1);
  }

  // Decrypt the access token
  const token = encryptionService.decrypt(integration.accessTokenEncrypted);

  const selectedChannels = metadata?.selected_channels || [];

  if (selectedChannels.length === 0) {
    console.error("❌ No channels selected");
    process.exit(1);
  }

  const client = new WebClient(token);

  // Calculate timestamp for 7 days ago
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  console.log(`📅 Fetching messages since: ${new Date(sevenDaysAgo * 1000).toLocaleString()}\n`);

  let totalNewMessages = 0;

  for (const channelId of selectedChannels) {
    try {
      console.log(`📱 Processing channel: ${channelId}`);

      // Fetch channel name
      const channelInfo = await client.conversations.info({ channel: channelId });
      const channelName = channelInfo.channel?.name || channelId;

      // Fetch messages with 'oldest' parameter
      const result = await client.conversations.history({
        channel: channelId,
        oldest: sevenDaysAgo.toString(),
        limit: 1000, // Max per call
      });

      if (!result.ok || !result.messages) {
        console.log(`  ⚠️  Failed to fetch messages`);
        continue;
      }

      const messages = result.messages;
      console.log(`  Found ${messages.length} new messages`);

      // Check which messages are already in DB
      let newCount = 0;
      let duplicateCount = 0;

      for (const msg of messages) {
        const msgId = `slack-${channelId}-${msg.ts}-chunk-0`;

        // Check if exists
        const existing = await db
          .select()
          .from(searchContent)
          .where(eq(searchContent.id, msgId))
          .limit(1);

        if (existing.length > 0) {
          duplicateCount++;
          continue; // Skip if exists
        }

        // Get user info
        let username = "Unknown";
        if (msg.user) {
          try {
            const userInfo = await client.users.info({ user: msg.user });
            username = userInfo.user?.name || msg.user;
          } catch (e) {
            username = msg.user;
          }
        }

        // Insert new message
        await db.insert(searchContent).values({
          id: msgId,
          organizationId: orgId,
          source: "slack",
          sourceType: msg.thread_ts ? "thread_reply" : "message",
          text: msg.text || "",
          textVector: sql`to_tsvector('english', ${msg.text || ""})`,
          channelId,
          channelName,
          userId: msg.user,
          username,
          timestamp: Math.floor(parseFloat(msg.ts!) * 1000), // Convert to milliseconds
          date: new Date(parseFloat(msg.ts!) * 1000).toISOString().split("T")[0], // YYYY-MM-DD
        });

        newCount++;
        totalNewMessages++;
      }

      console.log(`  ✅ Added ${newCount} new, skipped ${duplicateCount} duplicates\n`);
    } catch (error) {
      console.error(`  ❌ Error processing channel ${channelId}:`, error);
    }
  }

  console.log("=".repeat(60));
  console.log(`✅ Quick sync complete! Added ${totalNewMessages} new messages`);
  console.log("=".repeat(60));
  console.log("\n⚠️  Note: This script only adds to PostgreSQL (searchContent table).");
  console.log("Run full sync to embed in Pinecone: npm run sync-slack " + orgId);
  console.log();

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
