/**
 * SessionIngestionService - Embeds and stores session chunks
 *
 * Triggered when session status becomes "ready"
 * Completely separate from knowledge agent domain
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { SessionChunkingService } from "./session-chunking.service.js";
import { embeddingService } from "./embedding.service.js";

export class SessionIngestionService {
  /**
   * Ingest session data - chunk, embed, and store
   * Called when session status becomes "ready"
   */
  static async ingestSession(
    sessionId: string
  ): Promise<{ success: boolean; chunksCreated: number; error?: string }> {
    try {
      console.log(`[SessionIngestion] Starting ingestion for session ${sessionId}`);

      // 1. Fetch session data
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return { success: false, chunksCreated: 0, error: "Session not found" };
      }

      if (session.status !== "ready") {
        return {
          success: false,
          chunksCreated: 0,
          error: `Session status is ${session.status}, expected 'ready'`,
        };
      }

      // 2. Fetch session captures
      const captures = await db
        .select()
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, sessionId))
        .orderBy(schema.sessionCaptures.sequenceNumber);

      console.log(`[SessionIngestion] Found ${captures.length} captures`);

      // 3. Fetch session summary (may not exist)
      const [summary] = await db
        .select()
        .from(schema.sessionSummaries)
        .where(eq(schema.sessionSummaries.sessionId, sessionId))
        .orderBy(schema.sessionSummaries.version)
        .limit(1);

      console.log(`[SessionIngestion] Summary ${summary ? "found" : "not found"}`);

      // 4. Check if already ingested
      const existingChunks = await db
        .select()
        .from(schema.sessionChunks)
        .where(eq(schema.sessionChunks.sessionId, sessionId))
        .limit(1);

      if (existingChunks.length > 0) {
        console.log(`[SessionIngestion] Session already ingested, skipping`);
        return { success: true, chunksCreated: 0, error: "Already ingested" };
      }

      // 5. Chunk the session data
      const chunks = await SessionChunkingService.chunkSession(
        session.id,
        session.name,
        session.sessionGoal,
        session.startedAt,
        session.endedAt,
        captures,
        summary
      );

      console.log(`[SessionIngestion] Created ${chunks.length} chunks`);

      if (chunks.length === 0) {
        return { success: false, chunksCreated: 0, error: "No chunks created" };
      }

      // 6. Embed and store each chunk
      let chunksCreated = 0;
      for (const chunk of chunks) {
        try {
          const textLength = chunk.text.length;
          console.log(
            `[SessionIngestion] Processing ${chunk.chunkType} chunk ${chunk.chunkIndex} (${textLength} chars)`
          );

          // Generate embedding
          console.log(`[SessionIngestion] → Sending to OpenAI for embedding...`);
          const embedding = await embeddingService.embedText(chunk.text);
          console.log(
            `[SessionIngestion] ✅ OpenAI returned embedding (${embedding.length} dimensions)`
          );

          // Store chunk
          await db.insert(schema.sessionChunks).values({
            sessionId: session.id,
            organizationId: session.organizationId,
            userId: session.userId, // Added in migration 0028
            chunkIndex: chunk.chunkIndex,
            chunkType: chunk.chunkType,
            text: chunk.text,
            embedding: embedding as any,
            metadata: chunk.metadata as any,
          });

          chunksCreated++;
          console.log(
            `[SessionIngestion] ✅ Stored ${chunk.chunkType} chunk ${chunk.chunkIndex} with embedding in database`
          );
        } catch (error) {
          console.error(
            `[SessionIngestion] ❌ Failed to embed/store chunk ${chunk.chunkIndex}:`,
            error
          );
          // Continue with other chunks even if one fails
        }
      }

      console.log(`[SessionIngestion] Completed: ${chunksCreated}/${chunks.length} chunks stored`);

      return {
        success: chunksCreated > 0,
        chunksCreated,
        error: chunksCreated === 0 ? "Failed to store any chunks" : undefined,
      };
    } catch (error) {
      console.error(`[SessionIngestion] Error ingesting session ${sessionId}:`, error);
      return {
        success: false,
        chunksCreated: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Delete all chunks for a session (cleanup/re-ingestion)
   */
  static async deleteSessionChunks(sessionId: string): Promise<void> {
    await db.delete(schema.sessionChunks).where(eq(schema.sessionChunks.sessionId, sessionId));
    console.log(`[SessionIngestion] Deleted chunks for session ${sessionId}`);
  }

  /**
   * Re-ingest session (delete old chunks and create new ones)
   */
  static async reingestSession(
    sessionId: string
  ): Promise<{ success: boolean; chunksCreated: number; error?: string }> {
    await this.deleteSessionChunks(sessionId);
    return this.ingestSession(sessionId);
  }
}
