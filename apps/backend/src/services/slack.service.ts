import { WebClient } from "@slack/web-api";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { encryptionService } from "./encryption.service.js";

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members?: number;
}

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  channel: string;
  thread_ts?: string;
  permalink: string;
}

class SlackService {
  /**
   * Get Slack WebClient instance for an organization
   * Decrypts the access token from database before use
   */
  private async getClient(organizationId: string): Promise<WebClient> {
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, organizationId),
          eq(schema.integrations.provider, "slack")
        )
      )
      .limit(1);

    if (!integration) {
      throw new Error("Slack integration not found or not connected");
    }

    // Decrypt token before use (SECURITY CRITICAL)
    if (!integration.accessTokenEncrypted) {
      throw new Error("No encrypted access token found");
    }

    const accessToken = encryptionService.decrypt(integration.accessTokenEncrypted);
    return new WebClient(accessToken);
  }

  /**
   * List all accessible channels (public and private)
   * Only returns channels the bot has been invited to
   */
  async listChannels(organizationId: string): Promise<SlackChannel[]> {
    const client = await this.getClient(organizationId);
    const channels: SlackChannel[] = [];

    try {
      let cursor: string | undefined;

      do {
        const result = await client.conversations.list({
          types: "public_channel,private_channel",
          exclude_archived: true,
          cursor,
          limit: 200,
        });

        if (result.channels) {
          channels.push(
            ...result.channels.map((ch: any) => ({
              id: ch.id!,
              name: ch.name!,
              is_private: ch.is_private || false,
              is_member: ch.is_member || false,
              num_members: ch.num_members,
            }))
          );
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      // Filter to only show channels the bot is a member of
      return channels.filter((ch) => ch.is_member);
    } catch (error) {
      throw new Error("Failed to fetch Slack channels", { cause: error });
    }
  }

  /**
   * Fetch messages from a channel with pagination
   */
  async fetchChannelMessages(
    organizationId: string,
    channelId: string,
    cursor?: string,
    limit: number = 100,
    oldest?: string
  ): Promise<{
    messages: SlackMessage[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const client = await this.getClient(organizationId);

    try {
      const result = await client.conversations.history({
        channel: channelId,
        cursor,
        limit,
        ...(oldest && { oldest }),
      });

      if (!result.ok || !result.messages) {
        throw new Error(`Failed to fetch messages: ${result.error}`);
      }

      // Generate permalinks for each message
      const messages: SlackMessage[] = await Promise.all(
        result.messages.map(async (msg: any) => {
          let permalink = "";
          try {
            const permalinkResult = await client.chat.getPermalink({
              channel: channelId,
              message_ts: msg.ts!,
            });
            permalink = permalinkResult.permalink || "";
          } catch (permalinkError) {
            // Permalink fetch is non-critical, continue without it
            permalink = "";
          }

          return {
            ts: msg.ts!,
            text: msg.text || "",
            user: msg.user || "unknown",
            channel: channelId,
            thread_ts: msg.thread_ts,
            permalink,
          };
        })
      );

      return {
        messages,
        nextCursor: result.response_metadata?.next_cursor,
        hasMore: result.has_more || false,
      };
    } catch (error) {
      throw new Error("Failed to fetch channel messages", { cause: error });
    }
  }

  /**
   * Get user info (name, real_name)
   * Returns null if user info cannot be fetched (non-critical)
   */
  async getUserInfo(organizationId: string, userId: string) {
    const client = await this.getClient(organizationId);

    try {
      const result = await client.users.info({ user: userId });

      return {
        id: result.user?.id,
        name: result.user?.name,
        real_name: result.user?.real_name,
        email: result.user?.profile?.email,
      };
    } catch (error) {
      // User info fetch is non-critical, return null
      return null;
    }
  }

  /**
   * Get channel info (name, description)
   * Returns null if channel info cannot be fetched (non-critical)
   */
  async getChannelInfo(organizationId: string, channelId: string) {
    const client = await this.getClient(organizationId);

    try {
      const result = await client.conversations.info({ channel: channelId });

      return {
        id: result.channel?.id,
        name: result.channel?.name,
        is_private: result.channel?.is_private,
        topic: result.channel?.topic?.value,
        purpose: result.channel?.purpose?.value,
      };
    } catch (error) {
      // Channel info fetch is non-critical, return null
      return null;
    }
  }

  /**
   * Send a message to a Slack channel
   * Used for delivering session summaries and other notifications
   */
  async sendMessage(
    organizationId: string,
    channelId: string,
    message: {
      text: string;
      blocks?: any[];
      thread_ts?: string;
    }
  ): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const client = await this.getClient(organizationId);

    try {
      const result = await client.chat.postMessage({
        channel: channelId,
        text: message.text,
        blocks: message.blocks,
        thread_ts: message.thread_ts,
        unfurl_links: false,
        unfurl_media: false,
      });

      return {
        ok: result.ok || false,
        ts: result.ts,
      };
    } catch (error: any) {
      console.error("[SlackService] Failed to send message:", error);
      return {
        ok: false,
        error: error.message || "Failed to send message",
      };
    }
  }

  /**
   * Update an existing message in a Slack channel
   * Used for updating session summary status
   */
  async updateMessage(
    organizationId: string,
    channelId: string,
    messageTs: string,
    message: {
      text: string;
      blocks?: any[];
    }
  ): Promise<{ ok: boolean; error?: string }> {
    const client = await this.getClient(organizationId);

    try {
      const result = await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: message.text,
        blocks: message.blocks,
      });

      return { ok: result.ok || false };
    } catch (error: any) {
      console.error("[SlackService] Failed to update message:", error);
      return {
        ok: false,
        error: error.message || "Failed to update message",
      };
    }
  }
}

export const slackService = new SlackService();
