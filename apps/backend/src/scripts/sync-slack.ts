#!/usr/bin/env tsx
/**
 * Automatic Incremental Slack Sync Script
 *
 * Automatically syncs only NEW Slack messages since the last sync.
 * Checks DB for latest message timestamp and fetches from there.
 *
 * Usage:
 *   npm run sync-slack
 *
 * Example:
 *   npm run sync-slack
 */

import { db } from "../db/client.js";
import { integrations } from "../db/schema/integrations.schema.js";
import { searchContent } from "../db/schema/search-content.schema.js";
import { eq, desc } from "drizzle-orm";
import { WebClient } from "@slack/web-api";
import { vectorService } from "../services/vector.service.js";
import { embeddingService } from "../services/embedding.service.js";
import { validateConfig } from "../config.js";

async function main() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Initialize vector service
  vectorService.initialize();

  console.log("\n🚀 Starting automatic incremental Slack sync\n");

  try {
    // Step 1: Find the latest message timestamp in DB
    const [latestMessage] = await db
      .select({ timestamp: searchContent.timestamp })
      .from(searchContent)
      .where(eq(searchContent.source, "slack"))
      .orderBy(desc(searchContent.timestamp))
      .limit(1);

    let oldestTimestamp: number | undefined;
    if (latestMessage && latestMessage.timestamp) {
      // Convert from milliseconds to seconds (Slack format)
      oldestTimestamp = Math.floor(latestMessage.timestamp / 1000);
      const lastSyncDate = new Date(latestMessage.timestamp);
      console.log(`📅 Last sync: ${lastSyncDate.toLocaleString()}`);
      console.log(`📥 Fetching messages since then...\n`);
    } else {
      console.log("📭 No previous messages found - fetching all history\n");
    }

    // Step 2: Get organization (there's only one)
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.provider, "slack"))
      .limit(1);

    if (!integration) {
      console.error("❌ No Slack integration found");
      process.exit(1);
    }

    const orgId = integration.organizationId;
    const metadata = integration.metadata as any;
    const token = integration.accessToken;
    const selectedChannels: string[] = metadata?.selected_channels || [];

    if (!token) {
      console.error("❌ No Slack access token found");
      process.exit(1);
    }

    if (selectedChannels.length === 0) {
      console.error("❌ No channels selected for syncing");
      process.exit(1);
    }

    const client = new WebClient(token);

    let totalNewMessages = 0;
    let totalChannelsProcessed = 0;

    // Step 3: Fetch new messages from each channel
    for (const channelId of selectedChannels) {
      try {
        // Get channel info
        const channelInfo = await client.conversations.info({ channel: channelId });
        const channelName = channelInfo.channel?.name || channelId;

        console.log(`📱 ${channelName}`);

        // Fetch messages with 'oldest' parameter (incremental)
        const result = await client.conversations.history({
          channel: channelId,
          oldest: oldestTimestamp?.toString(), // Only fetch messages after this
          limit: 1000,
        });

        if (!result.ok || !result.messages) {
          console.log(`  ⚠️  Failed to fetch messages\n`);
          continue;
        }

        const messages = result.messages;
        console.log(`  Found ${messages.length} new messages`);

        if (messages.length === 0) {
          console.log(`  ✅ Up to date\n`);
          continue;
        }

        // Collect messages for batch Pinecone upsert
        const vectorRecords: Array<{
          id: string;
          values: number[];
          metadata: any;
        }> = [];

        // Process each message
        for (const msg of messages) {
          const msgId = `slack-${channelId}-${msg.ts}-chunk-0`;

          // Check if already exists (safety check)
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

          const messageText = msg.text || "";
          const messageTimestamp = Math.floor(parseFloat(msg.ts!) * 1000);

          // Insert into DB
          await db.insert(searchContent).values({
            id: msgId,
            organizationId: orgId,
            source: "slack",
            sourceType: msg.thread_ts ? "thread_reply" : "message",
            text: messageText,
            textVector: "", // Will be populated by trigger
            channelId,
            channelName,
            userId: msg.user || null,
            username,
            timestamp: messageTimestamp,
            date: new Date(messageTimestamp).toISOString().split("T")[0],
          });

          // Generate embedding for Pinecone
          const embedding = await embeddingService.embedText(messageText);

          // Add to batch for Pinecone upsert
          vectorRecords.push({
            id: msgId,
            values: embedding,
            metadata: {
              organization_id: orgId,
              source: "slack",
              source_type: msg.thread_ts ? "thread_reply" : "message",
              text: messageText,
              channel_id: channelId,
              channel_name: channelName,
              user_id: msg.user || null,
              username,
              timestamp: messageTimestamp,
              date: new Date(messageTimestamp).toISOString().split("T")[0],
            },
          });

          totalNewMessages++;
        }

        // Batch upsert to Pinecone
        if (vectorRecords.length > 0) {
          console.log(`  📤 Upserting ${vectorRecords.length} messages to Pinecone...`);
          await vectorService.upsertVectors(vectorRecords);
          console.log(`  ✅ Added ${messages.length} new messages (DB + Pinecone)\n`);
        } else {
          console.log(`  ✅ Up to date\n`);
        }
        totalChannelsProcessed++;
      } catch (error) {
        console.error(`  ❌ Error: ${error instanceof Error ? error.message : error}\n`);
      }
    }

    // Summary
    console.log("=".repeat(60));
    console.log("✅ Sync Complete!");
    console.log("=".repeat(60));
    console.log(`Channels processed: ${totalChannelsProcessed}/${selectedChannels.length}`);
    console.log(`New messages added: ${totalNewMessages}`);
    console.log("=".repeat(60));
    console.log("\n💡 Tip: Messages are now searchable in your knowledge base!\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Sync failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the script
main();
