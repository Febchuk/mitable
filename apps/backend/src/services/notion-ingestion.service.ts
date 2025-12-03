/**
 * NotionIngestionService - Notion-specific ingestion logic
 *
 * Responsibilities:
 * - Fetch pages from Notion API with incremental sync support
 * - Call NotionChunkingService for structure-aware smart chunking
 * - Embed chunks with OpenAI
 * - Dual-write to Pinecone + PostgreSQL
 * - Update sync logs
 *
 * Pattern: Structure-aware chunking for technical docs (not generic token overlap)
 */

import { notionService } from "./notion.service.js";
import { notionChunkingService } from "./notion-chunking.service.js";
import { embeddingService } from "./embedding.service.js";
import { vectorService } from "./vector.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import type { VectorRecord } from "./vector.service.js";
import type { NewSearchContent } from "../db/schema/search-content.schema.js";

const SYNC_CONFIG = {
  BATCH_SIZE: 10, // Process blocks in batches
} as const;

export interface NotionIntegrationMetadata {
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner: any;
  duplicated_template_id?: string;
  [key: string]: any;
}

export interface IngestionProgress {
  channelsProcessed: number; // "channels" = pages for Notion
  totalChannels: number; // total pages
  messagesProcessed: number; // "messages" = blocks
  messagesEmbedded: number; // blocks embedded
  errors: string[];
  currentChannel?: string; // current page title
}

export interface IngestionResult {
  success: boolean;
  channelsProcessed: number; // pages processed
  messagesEmbedded: number; // blocks embedded
  totalMessages: number; // total blocks
  errors: string[];
  duration: number;
}

class NotionIngestionService {
  /**
   * Transform Notion vector metadata to PostgreSQL searchContent format
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
      source: metadata.source || "notion",
      sourceType: metadata.source_type,
      text: metadata.text || "",
      textVector: "", // Auto-populated by PostgreSQL trigger

      // Notion-specific fields
      pageId: metadata.page_id,
      pageTitle: metadata.page_title,
      blockId: metadata.block_id,
      blockType: metadata.block_type,

      // Notion structure-aware metadata (Migration 0010)
      sectionPath: metadata.section_path, // JSON string
      sectionTitle: metadata.section_title,
      sectionId: metadata.section_id,
      headingLevel: metadata.heading_level,
      chunkType: metadata.chunk_type,
      hasCode: metadata.has_code,
      hasTable: metadata.has_table,
      hasList: metadata.has_list,
      codeLanguage: metadata.code_language,

      // Timestamps
      timestamp: Math.floor(timestamp / 1000),
      date: metadata.date,

      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Sync Notion pages for an organization
   * Fetches all shared pages, embeds blocks, and stores in BOTH Pinecone AND PostgreSQL
   */
  async syncPages(
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

      // Check for data reconciliation needs
      const [pgCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.searchContent)
        .where(
          and(
            eq(schema.searchContent.organizationId, organizationId),
            eq(schema.searchContent.source, "notion")
          )
        );

      const postgresCount = pgCount?.count || 0;

      // Check Pinecone for existing vectors
      const namespace = `org-${organizationId}`;
      let pineconeCount = 0;

      try {
        const stats = await vectorService.getStats();
        pineconeCount = stats.namespaces?.[namespace]?.vectorCount || 0;
        console.log(
          `[NOTION SYNC] Data status - PostgreSQL: ${postgresCount} chunks, Pinecone: ${pineconeCount} vectors`
        );
      } catch (error) {
        console.log(`[NOTION SYNC] Could not check Pinecone stats`);
      }

      // Determine sync mode
      const needsReconciliation = postgresCount > 0 && pineconeCount < postgresCount * 0.9;
      const lastSyncedAt = integration.lastSyncedAt ? new Date(integration.lastSyncedAt) : null;

      let syncMode = lastSyncedAt ? "incremental" : "full";

      if (needsReconciliation) {
        syncMode = "full";
        console.log(
          `[NOTION SYNC] Starting ${syncMode} sync (reconciliation - Pinecone missing data)`
        );
        console.log(
          `[NOTION SYNC] PostgreSQL has ${postgresCount} chunks but Pinecone only has ${pineconeCount} vectors`
        );
        console.log(`[NOTION SYNC] Performing full re-sync to backfill Pinecone...`);
      } else {
        console.log(`[NOTION SYNC] Starting ${syncMode} sync for org ${organizationId}`);
        if (lastSyncedAt) {
          console.log(`[NOTION SYNC] Fetching pages modified since ${lastSyncedAt.toISOString()}`);
        }
      }

      // Search pages (with incremental filtering if no reconciliation needed)
      const pages = await notionService.searchPages(organizationId, {
        modifiedSince: needsReconciliation ? undefined : lastSyncedAt || undefined,
      });

      console.log(`[NOTION SYNC] Found ${pages.length} updated pages`);

      if (pages.length === 0 && !lastSyncedAt) {
        throw new Error(
          "No pages shared with integration. Please share pages in Notion or reconnect."
        );
      }

      // If no updated pages in incremental sync, that's OK
      if (pages.length === 0 && lastSyncedAt) {
        console.log("[NOTION SYNC] No pages modified since last sync - skipping");
        result.success = true;
        result.duration = Date.now() - startTime;

        await db
          .update(schema.syncLogs)
          .set({
            status: "success",
            itemsSynced: 0,
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLogId));

        return result;
      }

      // Process each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        try {
          console.log(`[NOTION SYNC] Processing page ${i + 1}/${pages.length}: "${page.title}"`);

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
          console.log(`[NOTION SYNC]   Fetching blocks from page...`);
          const blocks = await notionService.getPageBlocks(organizationId, page.id);
          console.log(`[NOTION SYNC]   ✅ Found ${blocks.length} blocks`);

          // Filter out empty blocks
          const validBlocks = blocks.filter((block) => block.text && block.text.trim().length > 0);
          console.log(`[NOTION SYNC]   Valid blocks (non-empty): ${validBlocks.length}`);

          if (validBlocks.length > 0) {
            // Process blocks in batches
            const totalBatches = Math.ceil(validBlocks.length / SYNC_CONFIG.BATCH_SIZE);
            console.log(
              `[NOTION SYNC]   Embedding ${validBlocks.length} blocks in ${totalBatches} batches...`
            );

            for (let j = 0; j < validBlocks.length; j += SYNC_CONFIG.BATCH_SIZE) {
              const batch = validBlocks.slice(j, j + SYNC_CONFIG.BATCH_SIZE);
              const batchNum = Math.floor(j / SYNC_CONFIG.BATCH_SIZE) + 1;

              console.log(
                `[NOTION SYNC]     Batch ${batchNum}/${totalBatches}: Processing ${batch.length} blocks...`
              );
              await this.processBlockBatch(
                batch,
                page,
                organizationId,
                workspaceId,
                workspaceName,
                botId
              );

              result.messagesEmbedded += batch.length;
              result.totalMessages += batch.length;
              console.log(
                `[NOTION SYNC]     ✅ Batch ${batchNum}/${totalBatches} complete (Total embedded: ${result.messagesEmbedded})`
              );

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
            console.log(
              `[NOTION SYNC]   ✅ Page "${page.title}" complete - ${validBlocks.length} blocks embedded`
            );
          } else {
            console.log(`[NOTION SYNC]   ⚠️  No valid content to embed for "${page.title}"`);
          }

          result.channelsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process page ${page.title}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`[NOTION SYNC]   ❌ ${errorMsg}`);
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

      // Update integration lastSyncedAt (only on successful sync)
      await db
        .update(schema.integrations)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));

      result.success = true;
      result.duration = Date.now() - startTime;

      // Log completion summary
      console.log(`[NOTION SYNC] ✅ Sync complete for org ${organizationId}`);
      console.log(`[NOTION SYNC]    Mode: ${syncMode}`);
      console.log(`[NOTION SYNC]    Pages synced: ${result.channelsProcessed}`);
      console.log(`[NOTION SYNC]    Blocks embedded: ${result.messagesEmbedded}`);
      console.log(`[NOTION SYNC]    Duration: ${Math.round(result.duration / 1000)}s`);
      if (result.errors.length > 0) {
        console.log(`[NOTION SYNC]    Errors: ${result.errors.length}`);
      }

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
   * Process a batch of Notion blocks: chunk with structure-awareness, embed, and dual-write
   */
  private async processBlockBatch(
    blocks: any[],
    page: any,
    organizationId: string,
    workspaceId: string,
    workspaceName: string,
    botId: string
  ): Promise<void> {
    try {
      // Use structure-aware chunking for Notion
      // This preserves headings, code blocks, and creates rich metadata
      const smartChunks = notionChunkingService.chunkNotionBlocks(blocks, page.title);

      console.log(
        `[NOTION SYNC]       Created ${smartChunks.length} smart chunks from ${blocks.length} blocks`
      );

      const texts = smartChunks.map((chunk) => chunk.text);
      const embeddings = await embeddingService.embedTexts(texts);

      const vectors = smartChunks.map((chunk, idx) => {
        // Get the first block referenced by this chunk for timestamps
        const firstBlockId = chunk.block_ids[0];
        const firstBlock = blocks.find((b) => b.id === firstBlockId);
        const editedDate = firstBlock ? new Date(firstBlock.last_edited_time) : new Date();

        return {
          id: `notion-${page.id}-${chunk.section_id}-chunk-${chunk.chunkIndex}`,
          values: embeddings[idx],
          metadata: {
            text: chunk.text,
            source: "notion",
            source_type: "block",

            page_id: page.id,
            page_title: page.title,
            page_url: page.url,

            // Original block metadata (for backward compat)
            block_id: chunk.block_ids[0], // Primary block
            block_type: firstBlock?.type || "unknown",

            // Structure-aware metadata
            section_path: JSON.stringify(chunk.section_path), // Store as JSON string
            section_title: chunk.section_title,
            section_id: chunk.section_id,
            ...(chunk.heading_level !== null && { heading_level: chunk.heading_level }),

            chunk_type: chunk.chunk_type,
            has_code: chunk.has_code,
            has_table: chunk.has_table,
            has_list: chunk.has_list,

            ...(chunk.code_language && { code_language: chunk.code_language }),

            chunk_index: chunk.chunkIndex,
            total_chunks: chunk.totalChunks,
            is_chunked: chunk.totalChunks > 1,

            created_by_id: page.created_by_id,
            last_edited_by_id: page.last_edited_by_id,

            created_time: firstBlock?.created_time || new Date().toISOString(),
            last_edited_time: firstBlock?.last_edited_time || new Date().toISOString(),
            timestamp: Math.floor(editedDate.getTime() / 1000),
            date: editedDate.toISOString().split("T")[0],

            organization_id: organizationId,
            workspace_id: workspaceId,
            workspace_name: workspaceName,
            bot_id: botId,

            ...(page.parent_page_id && { parent_page_id: page.parent_page_id }),
            ...(page.parent_database_id && { parent_database_id: page.parent_database_id }),
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

      // Use onConflictDoUpdate to handle re-syncing of updated pages/blocks
      await db
        .insert(schema.searchContent)
        .values(searchContentRecords)
        .onConflictDoUpdate({
          target: schema.searchContent.id,
          set: {
            text: sql`EXCLUDED.text`,
            pageTitle: sql`EXCLUDED.page_title`,
            // Update structure-aware metadata on re-sync
            sectionPath: sql`EXCLUDED.section_path`,
            sectionTitle: sql`EXCLUDED.section_title`,
            chunkType: sql`EXCLUDED.chunk_type`,
            hasCode: sql`EXCLUDED.has_code`,
            hasTable: sql`EXCLUDED.has_table`,
            hasList: sql`EXCLUDED.has_list`,
            codeLanguage: sql`EXCLUDED.code_language`,
            timestamp: sql`EXCLUDED.timestamp`,
            date: sql`EXCLUDED.date`,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error("[NOTION SYNC] ❌ Batch processing error:", error);
      console.error(
        "[NOTION SYNC] Error details:",
        error instanceof Error ? error.message : String(error)
      );
      if (error instanceof Error && error.stack) {
        console.error("[NOTION SYNC] Stack trace:", error.stack);
      }
      throw new Error("Failed to process Notion block batch", { cause: error });
    }
  }
}

export const notionIngestionService = new NotionIngestionService();
