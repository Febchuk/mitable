#!/usr/bin/env tsx
/**
 * Check Latest Slack Messages in Supabase
 *
 * Verifies that the latest Slack messages are in the database.
 * Shows the most recent messages by channel with timestamps.
 *
 * Usage:
 *   npm run check-slack <organizationId>
 *
 * Example:
 *   npm run check-slack 7c12a697-6f3f-4dc9-a108-f81046cde063
 */

import { db } from "../db/client.js";
import { searchContent } from "../db/schema/search-content.schema.js";
import { eq, desc } from "drizzle-orm";

interface ChannelStats {
  channelId: string;
  channelName: string;
  latestMessageDate: Date;
  messageCount: number;
  latestMessageText: string;
}

async function main() {
  console.log(`\n🔍 Checking latest Slack messages in database\n`);

  try {
    // Get all Slack messages (no org filter since there's only one org)
    const slackMessages = await db
      .select({
        id: searchContent.id,
        organizationId: searchContent.organizationId,
        channelId: searchContent.channelId,
        channelName: searchContent.channelName,
        username: searchContent.username,
        text: searchContent.text,
        timestamp: searchContent.timestamp,
        date: searchContent.date,
      })
      .from(searchContent)
      .where(eq(searchContent.source, "slack"))
      .orderBy(desc(searchContent.timestamp));

    if (slackMessages.length === 0) {
      console.log("❌ No Slack messages found in database for this organization.");
      process.exit(1);
    }

    // Group by channel and find latest message per channel
    const channelMap = new Map<string, ChannelStats>();

    for (const msg of slackMessages) {
      const channelId = msg.channelId || "unknown";
      const channelName = msg.channelName || "unknown";
      const messageDate = msg.timestamp ? new Date(msg.timestamp) : new Date(0);

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          channelId,
          channelName,
          latestMessageDate: messageDate,
          messageCount: 0,
          latestMessageText: msg.text.substring(0, 100),
        });
      }

      const stats = channelMap.get(channelId)!;
      stats.messageCount++;

      // Update latest message if this one is newer
      if (messageDate > stats.latestMessageDate) {
        stats.latestMessageDate = messageDate;
        stats.latestMessageText = msg.text.substring(0, 100);
      }
    }

    // Convert to array and sort by latest message date
    const channels = Array.from(channelMap.values()).sort(
      (a, b) => b.latestMessageDate.getTime() - a.latestMessageDate.getTime()
    );

    // Display results
    console.log("=".repeat(80));
    console.log("📊 Slack Data Summary");
    console.log("=".repeat(80));
    console.log(`Organization ID: ${slackMessages[0].organizationId}`);
    console.log(`Total messages in DB: ${slackMessages.length}`);
    console.log(`Total channels: ${channels.length}`);

    const overallLatestDate = slackMessages[0].timestamp
      ? new Date(slackMessages[0].timestamp)
      : new Date(0);
    console.log(`Overall latest message: ${overallLatestDate.toLocaleString()}`);
    console.log("=".repeat(80));

    console.log("\n📱 Latest Message Per Channel:\n");

    // Show top 10 channels by latest message
    const topChannels = channels.slice(0, 10);

    for (const channel of topChannels) {
      const timeAgo = getTimeAgo(channel.latestMessageDate);
      console.log(`#${channel.channelName}`);
      console.log(`  Messages: ${channel.messageCount}`);
      console.log(`  Latest: ${channel.latestMessageDate.toLocaleString()} (${timeAgo})`);
      console.log(`  Preview: ${channel.latestMessageText}...`);
      console.log("");
    }

    // Check if data is recent (within last 24 hours)
    const now = new Date();
    const latestMessage = slackMessages[0];
    const latestDate = latestMessage.timestamp ? new Date(latestMessage.timestamp) : new Date(0);
    const hoursSinceLatest = (now.getTime() - latestDate.getTime()) / (1000 * 60 * 60);

    console.log("=".repeat(80));
    if (hoursSinceLatest < 24) {
      console.log("✅ Data is recent! (Latest message within 24 hours)");
    } else {
      console.log(
        `⚠️  Data may be stale. Latest message is ${hoursSinceLatest.toFixed(1)} hours old.`
      );
      console.log("   Consider running a manual sync: npm run sync-slack <organizationId>");
    }
    console.log("=".repeat(80) + "\n");

    process.exit(0);
  } catch (error) {
    console.error(
      "\n❌ Error checking Slack messages:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Run the script
main();
