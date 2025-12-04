/**
 * SlackIngestionService - Slack-specific ingestion logic
 *
 * Responsibilities:
 * - Fetch messages from Slack API with pagination
 * - Call SlackChunkingService for thread-aware smart chunking
 * - Embed chunks with OpenAI
 * - Dual-write to Pinecone + PostgreSQL
 * - Update sync logs
 * - User info caching (97% API reduction)
 *
 * Pattern: Slack v2.0 - thread-aware chunking, not generic 500-1000 token overlap BS
 */

import { slackService } from "./slack.service.js";
import { slackChunkingService } from "./slack-chunking.service.js";
import { embeddingService } from "./embedding.service.js";
import { vectorService } from "./vector.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, desc, sql } from "drizzle-orm";
import type { VectorRecord } from "./vector.service.js";
import type { NewSearchContent } from "../db/schema/search-content.schema.js";

const SYNC_CONFIG = {
  MESSAGES_PER_PAGE: 15, // Tier 1 limit for distributed apps (non-Marketplace) - reduced from 1000 to 15!
  BATCH_SIZE: 100,
  SLACK_API_DELAY_MS: 65000, // 65s delay between Slack API calls (Tier 1 = 1 req/min for distributed apps)
  INITIAL_SYNC_DAYS: 30, // Only fetch last 30 days on first sync (prevent massive data ingestion)
} as const;

export interface SlackIntegrationMetadata {
  team_id?: string;
  team_name?: string;
  bot_user_id?: string;
  scope?: string;
  app_id?: string;
  selected_channels?: string[];
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

class SlackIngestionService {
  /**
   * Transform Slack vector metadata to PostgreSQL searchContent format
   */
  private transformVectorToSearchContent(
    vector: VectorRecord,
    organizationId: string
  ): NewSearchContent {
    const { id, metadata } = vector;

    const timestamp = metadata.timestamp
      ? metadata.timestamp < 10000000000
        ? metadata.timestamp * 1000
        : metadata.timestamp
      : Date.now();

    return {
      id,
      organizationId,
      source: metadata.source || "slack",
      sourceType: metadata.source_type,
      text: metadata.text || "",
      textVector: "", // Auto-populated by PostgreSQL trigger

      // Slack-specific fields
      channelId: metadata.channel_id,
      channelName: metadata.channel_name,
      userId: metadata.user_id,
      username: metadata.username,

      // Slack structure-aware metadata (Migration 0011)
      chunkType: metadata.chunk_type,
      authors: metadata.authors,
      mentionedUsers: metadata.mentioned_users,
      hasCode: metadata.has_code,
      codeLanguage: metadata.code_language,
      hasLinks: metadata.has_links,
      hasAttachments: metadata.has_attachments,
      hasReactions: metadata.has_reactions,
      reactionSummary: metadata.reaction_summary ? JSON.parse(metadata.reaction_summary) : null,
      threadId: metadata.thread_id,
      isThreadRoot: metadata.is_thread_root,
      messageIds: metadata.message_ids,

      // Chunk metadata
      chunkIndex: metadata.chunk_index || 0,
      totalChunks: metadata.total_chunks || 1,
      isChunked: metadata.is_chunked || false,

      // Temporal metadata
      timestamp,
      date: metadata.date || new Date(timestamp).toISOString().split("T")[0],
    };
  }

  /**
   * Sync Slack messages for an organization
   * Fetches messages from selected channels, embeds them, and stores in BOTH Pinecone AND PostgreSQL
   */
  async syncMessages(
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

      // Determine sync mode (incremental vs full)
      // Check PostgreSQL for latest message
      const [latestMessage] = await db
        .select({ timestamp: schema.searchContent.timestamp })
        .from(schema.searchContent)
        .where(
          and(
            eq(schema.searchContent.organizationId, organizationId),
            eq(schema.searchContent.source, "slack")
          )
        )
        .orderBy(desc(schema.searchContent.timestamp))
        .limit(1);

      // Count PostgreSQL records
      const [pgCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.searchContent)
        .where(
          and(
            eq(schema.searchContent.organizationId, organizationId),
            eq(schema.searchContent.source, "slack")
          )
        );

      const postgresCount = pgCount?.count || 0;

      // Check Pinecone for existing vectors (to detect desync)
      const namespace = `org-${organizationId}`;
      let pineconeCount = 0;

      try {
        const stats = await vectorService.getStats();
        pineconeCount = stats.namespaces?.[namespace]?.vectorCount || 0;
        console.log(
          `📊 Data status - PostgreSQL: ${postgresCount} chunks, Pinecone: ${pineconeCount} vectors`
        );
      } catch (error) {
        console.log(`⚠️  Could not check Pinecone stats, assuming full sync needed`);
      }

      let oldestTimestamp: string | undefined;
      let syncMode = "full";

      // Smart sync mode detection
      // If PostgreSQL has data but Pinecone is missing/low, force full sync (data reconciliation)
      const needsReconciliation = postgresCount > 0 && pineconeCount < postgresCount * 0.9;

      if (needsReconciliation) {
        syncMode = "full";
        console.log(`🔄 Sync Mode: ${syncMode} (reconciliation - Pinecone missing data)`);
        console.log(
          `   PostgreSQL has ${postgresCount} chunks but Pinecone only has ${pineconeCount} vectors`
        );
        console.log(`   Performing full re-sync to backfill Pinecone...`);
      } else if (latestMessage?.timestamp) {
        // Both have data and counts match - do incremental
        oldestTimestamp = Math.floor(latestMessage.timestamp / 1000).toString();
        syncMode = "incremental";
        console.log(`🔄 Sync Mode: ${syncMode}`);
        console.log(`📅 Last sync: ${new Date(latestMessage.timestamp).toLocaleString()}`);
      } else {
        // First sync - limit to recent messages to avoid rate limit hell
        const daysAgo = Date.now() - SYNC_CONFIG.INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000;
        oldestTimestamp = Math.floor(daysAgo / 1000).toString();
        console.log(
          `🔄 Sync Mode: ${syncMode} (first sync - last ${SYNC_CONFIG.INITIAL_SYNC_DAYS} days)`
        );
        console.log(`📅 Fetching messages since: ${new Date(daysAgo).toLocaleString()}`);
      }

      // User info cache (to avoid redundant API calls - 97% reduction!)
      const userCache = new Map<
        string,
        { id?: string; name?: string; real_name?: string; email?: string } | null
      >();

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
              SYNC_CONFIG.MESSAGES_PER_PAGE,
              oldestTimestamp
            );

            if (messages.length === 0) break;

            // Enrich messages with user info (name, real_name) using cache
            const enrichedMessages = await Promise.all(
              messages.map(async (msg) => {
                // Check cache first
                if (!userCache.has(msg.user)) {
                  // Fetch and cache user info
                  const userInfo = await slackService.getUserInfo(organizationId, msg.user);
                  userCache.set(msg.user, userInfo);
                }

                const userInfo = userCache.get(msg.user);
                return {
                  ...msg,
                  user_name: userInfo?.name || msg.user,
                  user_real_name: userInfo?.real_name || userInfo?.name || msg.user,
                };
              })
            );

            // Process messages in batches
            for (let j = 0; j < enrichedMessages.length; j += SYNC_CONFIG.BATCH_SIZE) {
              const batch = enrichedMessages.slice(j, j + SYNC_CONFIG.BATCH_SIZE);
              const chunksCreated = await this.processBatch(
                batch,
                organizationId,
                workspaceId,
                workspaceName,
                channelName,
                channelInfo?.is_private || false
              );

              result.messagesEmbedded += chunksCreated; // Track chunks, not raw messages
              channelMessageCount += batch.length; // Track raw messages for display

              console.log(
                `   📊 Batch complete: +${chunksCreated} chunks (total: ${result.messagesEmbedded})`
              );

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

            // CRITICAL: Add delay between EVERY page to respect Tier 1 rate limits
            // No bursting - Slack detects patterns and rate limits harder
            if (cursor) {
              console.log(
                `   ⏳ Waiting ${SYNC_CONFIG.SLACK_API_DELAY_MS / 1000}s before next page (Slack rate limit)...`
              );
              await new Promise((resolve) => setTimeout(resolve, SYNC_CONFIG.SLACK_API_DELAY_MS));
            }
          } while (cursor);

          result.channelsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process channel ${channelId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`❌ Channel error:`, errorMsg);
          if (error instanceof Error && error.stack) {
            console.error(error.stack);
          }
          result.errors.push(errorMsg);
        }
      }

      console.log(`👥 User cache: ${userCache.size} unique users fetched`);

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

      console.log(`\n📊 Slack sync complete:`, JSON.stringify(result, null, 2));

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
   * Process a batch of Slack messages: chunk, embed, and dual-write to Pinecone + PostgreSQL
   * Uses thread-aware SlackChunkingService (NOT generic 500-1000 token overlap BS)
   * Returns: Number of chunks created
   */
  private async processBatch(
    messages: any[],
    organizationId: string,
    workspaceId: string,
    workspaceName: string,
    channelName: string,
    isPrivate: boolean
  ): Promise<number> {
    const validMessages = messages.filter((msg) => msg.text && msg.text.trim().length > 0);

    if (validMessages.length === 0) return 0;

    try {
      // Use thread-aware chunking (Slack v2.0 pattern)
      const smartChunks = slackChunkingService.chunkSlackMessages(
        validMessages,
        {
          id: validMessages[0].channel,
          name: channelName,
          is_dm: false, // TODO: Pass actual channel type
          is_group_dm: false,
        },
        {
          id: organizationId,
          name: workspaceName,
        }
      );

      console.log(
        `[SlackIngestion] Generated ${smartChunks.length} smart chunks from ${validMessages.length} messages`
      );

      if (smartChunks.length === 0) return 0;

      const texts = smartChunks.map((c) => c.text);
      const embeddings = await embeddingService.embedTexts(texts);

      // Build vectors with rich metadata from smart chunks
      const vectors = smartChunks.map((chunk, idx) => {
        const threadStartDate = new Date(chunk.thread_start_ts * 1000);

        return {
          id: `slack-${chunk.channel_id}-${chunk.thread_id}-chunk-${chunk.chunk_index}`,
          values: embeddings[idx],
          metadata: {
            text: chunk.text,
            source: "slack",
            source_type: chunk.is_thread_root ? "thread_root" : "thread_reply",

            // Channel context
            channel_id: chunk.channel_id,
            channel_name: chunk.channel_name,
            is_dm: chunk.is_dm,
            is_group_dm: chunk.is_group_dm,
            is_private_channel: isPrivate,
            channel_type: isPrivate ? "private_channel" : "public_channel",

            // Thread context
            thread_id: chunk.thread_id,
            thread_ts: chunk.thread_id,
            message_ids: chunk.message_ids,
            is_thread_root: chunk.is_thread_root,

            // STRUCTURE-AWARE METADATA (Migration 0011)
            chunk_type: chunk.chunk_type,
            authors: chunk.authors,
            mentioned_users: chunk.mentioned_users,
            has_code: chunk.has_code,
            ...(chunk.code_language && { code_language: chunk.code_language }),
            has_links: chunk.has_links,
            has_attachments: chunk.has_attachments,
            has_reactions: chunk.has_reactions,
            ...(chunk.reaction_summary && {
              reaction_summary: JSON.stringify(chunk.reaction_summary),
            }),

            // Chunk metadata
            chunk_index: chunk.chunk_index,
            total_chunks: chunk.total_chunks,
            is_chunked: chunk.total_chunks > 1,

            // Timestamps
            timestamp: Math.floor(chunk.thread_start_ts),
            date: threadStartDate.toISOString().split("T")[0],
            year: threadStartDate.getFullYear(),
            month: threadStartDate.getMonth() + 1,
            day_of_week: threadStartDate.toLocaleDateString("en-US", { weekday: "long" }),
            created_at: chunk.created_at,

            // Organization context
            organization_id: organizationId,
            workspace_id: workspaceId,
            workspace_name: chunk.workspace_name,
          },
        };
      });

      const namespace = `org-${organizationId}`;

      // DUAL-WRITE: Store in both Pinecone (semantic) and PostgreSQL (keyword)
      await vectorService.upsertVectors(vectors, namespace);

      // Transform vectors to PostgreSQL format and upsert (handles duplicates)
      const searchContentRecords = vectors.map((v) =>
        this.transformVectorToSearchContent(v, organizationId)
      );

      // Use onConflictDoUpdate to handle re-syncing of updated messages
      await db
        .insert(schema.searchContent)
        .values(searchContentRecords)
        .onConflictDoUpdate({
          target: schema.searchContent.id,
          set: {
            text: sql`EXCLUDED.text`,
            timestamp: sql`EXCLUDED.timestamp`,
            date: sql`EXCLUDED.date`,
            updatedAt: new Date(),
          },
        });

      // Return number of chunks created
      return smartChunks.length;
    } catch (error) {
      console.error("❌ processBatch error:", error);
      if (error instanceof Error) {
        console.error("Stack:", error.stack);
      }
      throw error; // Re-throw original error, don't wrap it
    }
  }
}

export const slackIngestionService = new SlackIngestionService();
