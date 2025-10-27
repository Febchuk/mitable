import { slackService } from "./slack.service.js";
import { notionService } from "./notion.service.js";
import { embeddingService } from "./embedding.service.js";
import { vectorService } from "./vector.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";

// Sync configuration constants
const SYNC_CONFIG = {
  MESSAGES_PER_PAGE: 100, // Number of messages to fetch per API call
  BATCH_SIZE: 10, // Number of messages to process in each embedding batch
} as const;

export interface SlackIntegrationMetadata {
  team_id?: string;
  team_name?: string;
  bot_user_id?: string;
  scope?: string;
  app_id?: string;
  selected_channels?: string[];
  // TODO: Define complete metadata structure
  [key: string]: any;
}

export interface NotionIntegrationMetadata {
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner: any;
  duplicated_template_id?: string;
  // TODO: Add selected_pages if we want to filter
  [key: string]: any;
}

export interface IngestionProgress {
  channelsProcessed: number;
  totalChannels: number;
  messagesProcessed: number;
  messagesEmbedded: number;
  errors: string[];
  currentChannel?: string;
}

export interface IngestionResult {
  success: boolean;
  channelsProcessed: number;
  messagesEmbedded: number;
  totalMessages: number;
  errors: string[];
  duration: number;
}

class IngestionService {
  /**
   * Sync Slack messages for an organization
   * Fetches messages from selected channels, embeds them, and stores in Pinecone
   */
  async syncSlackMessages(
    organizationId: string,
    onProgress?: (progress: IngestionProgress) => void
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      success: false,
      channelsProcessed: 0,
      messagesEmbedded: 0,
      totalMessages: 0,
      errors: [],
      duration: 0,
    };

    let syncLogId: string | null = null;

    try {
      // Get integration
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
        throw new Error("Slack integration not found");
      }

      // Get selected channels from metadata
      const metadata = integration.metadata as SlackIntegrationMetadata;
      const selectedChannels: string[] = metadata?.selected_channels || [];

      if (selectedChannels.length === 0) {
        throw new Error(
          "No channels selected for syncing. Please configure Slack integration first."
        );
      }

      // Create sync log
      const [syncLog] = await db
        .insert(schema.syncLogs)
        .values({
          integrationId: integration.id,
          status: "in_progress",
          itemsSynced: 0,
          startedAt: new Date(),
        })
        .returning();

      syncLogId = syncLog.id;

      // Get workspace info from metadata
      const workspaceId = metadata?.team_id || "unknown";
      const workspaceName = metadata?.team_name || "Slack Workspace";

      // Process each channel
      for (let i = 0; i < selectedChannels.length; i++) {
        const channelId = selectedChannels[i];

        try {
          // Get channel info
          const channelInfo = await slackService.getChannelInfo(organizationId, channelId);
          const channelName = channelInfo?.name || channelId;

          // Update progress
          onProgress?.({
            channelsProcessed: i,
            totalChannels: selectedChannels.length,
            messagesProcessed: result.totalMessages,
            messagesEmbedded: result.messagesEmbedded,
            errors: result.errors,
            currentChannel: channelName,
          });

          // Fetch messages from channel with pagination
          let cursor: string | undefined;
          let channelMessageCount = 0;

          do {
            const { messages, nextCursor, hasMore } = await slackService.fetchChannelMessages(
              organizationId,
              channelId,
              cursor,
              SYNC_CONFIG.MESSAGES_PER_PAGE
            );

            if (messages.length === 0) break;

            // Process messages in batches
            for (let j = 0; j < messages.length; j += SYNC_CONFIG.BATCH_SIZE) {
              const batch = messages.slice(j, j + SYNC_CONFIG.BATCH_SIZE);
              await this.processBatch(
                batch,
                organizationId,
                workspaceId,
                workspaceName,
                channelName,
                channelInfo?.is_private || false
              );

              result.messagesEmbedded += batch.length;
              channelMessageCount += batch.length;

              // Update progress
              onProgress?.({
                channelsProcessed: i,
                totalChannels: selectedChannels.length,
                messagesProcessed: result.totalMessages + channelMessageCount,
                messagesEmbedded: result.messagesEmbedded,
                errors: result.errors,
                currentChannel: channelName,
              });
            }

            result.totalMessages += messages.length;
            cursor = nextCursor;

            // Continue fetching until all messages are retrieved
            if (!hasMore) break;
          } while (cursor);

          result.channelsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process channel ${channelId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          result.errors.push(errorMsg);
        }
      }

      // Update sync log
      await db
        .update(schema.syncLogs)
        .set({
          status: "success",
          itemsSynced: result.messagesEmbedded,
          completedAt: new Date(),
        })
        .where(eq(schema.syncLogs.id, syncLogId));

      // Update integration lastSyncedAt
      await db
        .update(schema.integrations)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));

      result.success = true;
      result.duration = Date.now() - startTime;

      return result;
    } catch (error) {
      // Update sync log as failed
      if (syncLogId) {
        await db
          .update(schema.syncLogs)
          .set({
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLogId));
      }

      result.errors.push(error instanceof Error ? error.message : "Unknown error");
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Process a batch of messages: embed and store in Pinecone
   */
  private async processBatch(
    messages: any[],
    organizationId: string,
    workspaceId: string,
    workspaceName: string,
    channelName: string,
    isPrivate: boolean
  ): Promise<void> {
    // Filter out empty messages
    const validMessages = messages.filter((msg) => msg.text && msg.text.trim().length > 0);

    if (validMessages.length === 0) return;

    try {
      // Embed all messages in batch
      const texts = validMessages.map((msg) => msg.text);
      const embeddings = await embeddingService.embedTexts(texts);

      // Prepare vectors for Pinecone
      const vectors = await Promise.all(
        validMessages.map(async (msg, idx) => {
          // Get user info
          const userInfo = await slackService.getUserInfo(organizationId, msg.user);

          // Create timestamp
          const timestamp = parseFloat(msg.ts);
          const date = new Date(timestamp * 1000);

          return {
            id: `slack-${msg.channel}-${msg.ts}`,
            values: embeddings[idx],
            metadata: {
              // Core fields
              text: msg.text,
              source: "slack",
              source_type: msg.thread_ts ? "thread_reply" : "message",

              // Slack identifiers
              channel_id: msg.channel,
              channel_name: channelName,
              message_ts: msg.ts,
              ...(msg.thread_ts && { thread_ts: msg.thread_ts }), // Only include if exists

              // User information
              user_id: msg.user,
              username: userInfo?.name || "unknown",
              user_real_name: userInfo?.real_name || "Unknown User",

              // URL
              message_url: msg.permalink,

              // Date/Time filters
              timestamp: Math.floor(timestamp),
              date: date.toISOString().split("T")[0], // YYYY-MM-DD
              year: date.getFullYear(),
              month: date.getMonth() + 1,
              day_of_week: date.toLocaleDateString("en-US", { weekday: "long" }),

              // Organization context
              organization_id: organizationId,
              workspace_id: workspaceId,
              workspace_name: workspaceName,

              // Privacy
              is_private_channel: isPrivate,
              channel_type: isPrivate ? "private_channel" : "public_channel",
            },
          };
        })
      );

      // Upsert to Pinecone using organization namespace for data isolation
      const namespace = `org-${organizationId}`;
      await vectorService.upsertVectors(vectors, namespace);
    } catch (error) {
      throw new Error("Failed to process message batch", { cause: error });
    }
  }

  /**
   * Sync Notion pages for an organization
   * Fetches all shared pages, embeds blocks, and stores in Pinecone
   */
  async syncNotionPages(
    organizationId: string,
    onProgress?: (progress: IngestionProgress) => void
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      success: false,
      channelsProcessed: 0, // Using "channels" field for "pages" count
      messagesEmbedded: 0, // Using "messages" field for "blocks" count
      totalMessages: 0,
      errors: [],
      duration: 0,
    };

    let syncLogId: string | null = null;

    try {
      // Get integration
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.organizationId, organizationId),
            eq(schema.integrations.provider, "notion")
          )
        )
        .limit(1);

      if (!integration) {
        throw new Error("Notion integration not found");
      }

      // Get workspace info from metadata
      const metadata = integration.metadata as NotionIntegrationMetadata;
      const workspaceId = metadata?.workspace_id || "unknown";
      const workspaceName = metadata?.workspace_name || "Notion Workspace";
      const botId = metadata?.bot_id || "unknown";

      // Create sync log
      const [syncLog] = await db
        .insert(schema.syncLogs)
        .values({
          integrationId: integration.id,
          status: "in_progress",
          itemsSynced: 0,
          startedAt: new Date(),
        })
        .returning();

      syncLogId = syncLog.id;

      // Search all shared pages
      const pages = await notionService.searchPages(organizationId);

      if (pages.length === 0) {
        throw new Error(
          "No pages shared with integration. Please share pages in Notion or reconnect."
        );
      }

      // Process each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        try {
          // Update progress
          onProgress?.({
            channelsProcessed: i,
            totalChannels: pages.length,
            messagesProcessed: result.totalMessages,
            messagesEmbedded: result.messagesEmbedded,
            errors: result.errors,
            currentChannel: page.title,
          });

          // Fetch all blocks from page (recursive)
          const blocks = await notionService.getPageBlocks(organizationId, page.id);

          // Filter out empty blocks
          const validBlocks = blocks.filter((block) => block.text && block.text.trim().length > 0);

          if (validBlocks.length > 0) {
            // Process blocks in batches
            for (let j = 0; j < validBlocks.length; j += SYNC_CONFIG.BATCH_SIZE) {
              const batch = validBlocks.slice(j, j + SYNC_CONFIG.BATCH_SIZE);
              await this.processNotionBatch(
                batch,
                page,
                organizationId,
                workspaceId,
                workspaceName,
                botId
              );

              result.messagesEmbedded += batch.length;
              result.totalMessages += batch.length;

              // Update progress
              onProgress?.({
                channelsProcessed: i,
                totalChannels: pages.length,
                messagesProcessed: result.totalMessages,
                messagesEmbedded: result.messagesEmbedded,
                errors: result.errors,
                currentChannel: page.title,
              });
            }
          }

          result.channelsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process page ${page.title}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          result.errors.push(errorMsg);
        }
      }

      // Update sync log
      await db
        .update(schema.syncLogs)
        .set({
          status: "success",
          itemsSynced: result.messagesEmbedded,
          completedAt: new Date(),
        })
        .where(eq(schema.syncLogs.id, syncLogId));

      // Update integration lastSyncedAt
      await db
        .update(schema.integrations)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));

      result.success = true;
      result.duration = Date.now() - startTime;

      return result;
    } catch (error) {
      // Update sync log as failed
      if (syncLogId) {
        await db
          .update(schema.syncLogs)
          .set({
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLogId));
      }

      result.errors.push(error instanceof Error ? error.message : "Unknown error");
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Process a batch of Notion blocks: embed and store in Pinecone
   */
  private async processNotionBatch(
    blocks: any[],
    page: any,
    organizationId: string,
    workspaceId: string,
    workspaceName: string,
    botId: string
  ): Promise<void> {
    try {
      // Embed all block texts in batch
      const texts = blocks.map((block) => block.text);
      const embeddings = await embeddingService.embedTexts(texts);

      // Prepare vectors for Pinecone (block-level granularity)
      const vectors = blocks.map((block, idx) => {
        // Create timestamp from last edited time
        const editedDate = new Date(block.last_edited_time);

        return {
          id: `notion-${page.id}-${block.id}`,
          values: embeddings[idx],
          metadata: {
            // Core fields
            text: block.text,
            source: "notion",
            source_type: "block",

            // Page identification
            page_id: page.id,
            page_title: page.title,
            page_url: page.url,

            // Block-level details (granular search)
            block_id: block.id,
            block_type: block.type,

            // Authorship
            created_by_id: page.created_by_id,
            last_edited_by_id: page.last_edited_by_id,

            // Timestamps
            created_time: block.created_time,
            last_edited_time: block.last_edited_time,
            timestamp: Math.floor(editedDate.getTime() / 1000),

            // Date/Time filters
            date: editedDate.toISOString().split("T")[0], // YYYY-MM-DD
            year: editedDate.getFullYear(),
            month: editedDate.getMonth() + 1,

            // Organization context
            organization_id: organizationId,
            workspace_id: workspaceId,
            workspace_name: workspaceName,
            bot_id: botId,

            // Hierarchy (for context)
            ...(page.parent_page_id && { parent_page_id: page.parent_page_id }),
            ...(page.parent_database_id && { parent_database_id: page.parent_database_id }),
          },
        };
      });

      // Upsert to Pinecone using organization namespace for data isolation
      const namespace = `org-${organizationId}`;
      await vectorService.upsertVectors(vectors, namespace);
    } catch (error) {
      throw new Error("Failed to process Notion block batch", { cause: error });
    }
  }
}

export const ingestionService = new IngestionService();
