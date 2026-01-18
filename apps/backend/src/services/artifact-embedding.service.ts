/**
 * Artifact Embedding Service
 *
 * Generates and stores embeddings for artifacts in Pinecone for future RAG support.
 * Uses the existing embedding and vector services for consistent patterns.
 */

import { embeddingService } from "./embedding.service.js";
import { vectorService, type VectorRecord } from "./vector.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";

// Namespace for artifact vectors in Pinecone
const ARTIFACT_NAMESPACE = "artifacts";

// Maximum chunk size for embedding (approximately 6000 tokens ~ 24000 chars)
const MAX_CHUNK_CHARS = 24000;

// Overlap between chunks to maintain context
const CHUNK_OVERLAP = 500;

class ArtifactEmbeddingService {
  /**
   * Generate embeddings for artifact text and store in Pinecone
   */
  async generateAndStoreEmbeddings(
    artifactId: string,
    text: string,
    metadata: {
      organizationId: string;
      filename: string;
    }
  ): Promise<string[]> {
    console.log(`[ArtifactEmbedding] Processing artifact: ${artifactId}`);

    // Update status to processing
    await this.updateEmbeddingStatus(artifactId, "processing");

    try {
      // Chunk the text
      const chunks = this.chunkText(text, MAX_CHUNK_CHARS, CHUNK_OVERLAP);
      console.log(`[ArtifactEmbedding] Split into ${chunks.length} chunks`);

      // Generate embeddings for all chunks
      const embeddings = await embeddingService.embedTexts(chunks);

      // Build vector records
      const vectors: VectorRecord[] = embeddings.map((embedding, i) => ({
        id: `artifact-${artifactId}-chunk-${i}`,
        values: embedding,
        metadata: {
          text: chunks[i].substring(0, 1000), // Store truncated text for retrieval display
          artifactId,
          organizationId: metadata.organizationId,
          filename: metadata.filename,
          chunkIndex: i,
          totalChunks: chunks.length,
          type: "artifact",
          timestamp: Date.now(),
        },
      }));

      // Store in Pinecone
      await vectorService.upsertVectors(vectors, ARTIFACT_NAMESPACE);

      // Store vector IDs in database
      const vectorIds = vectors.map((v) => v.id);
      await db
        .update(schema.artifacts)
        .set({
          embeddingStatus: "completed",
          embeddingError: null,
          pineconeIds: vectorIds,
          updatedAt: new Date(),
        })
        .where(eq(schema.artifacts.id, artifactId));

      console.log(
        `[ArtifactEmbedding] Stored ${vectorIds.length} vectors for artifact: ${artifactId}`
      );

      return vectorIds;
    } catch (error) {
      console.error(`[ArtifactEmbedding] Failed for artifact ${artifactId}:`, error);

      // Update status to failed
      await db
        .update(schema.artifacts)
        .set({
          embeddingStatus: "failed",
          embeddingError: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(schema.artifacts.id, artifactId));

      throw error;
    }
  }

  /**
   * Query relevant artifact chunks for a given text
   * Used for RAG: find relevant artifact content based on session summary or query
   */
  async queryRelevant(
    queryText: string,
    options: {
      organizationId: string;
      artifactIds?: string[];
      topK?: number;
    }
  ): Promise<Array<{ id: string; text: string; score: number; artifactId: string; filename: string }>> {
    const { organizationId, artifactIds, topK = 5 } = options;

    // Generate query embedding
    const queryEmbedding = await embeddingService.embedText(queryText);

    // Build filter
    const filter: Record<string, any> = {
      organizationId,
      type: "artifact",
    };

    // If specific artifact IDs provided, filter by them
    if (artifactIds && artifactIds.length > 0) {
      filter.artifactId = { $in: artifactIds };
    }

    // Query Pinecone
    const results = await vectorService.queryVectors(
      queryEmbedding,
      topK,
      ARTIFACT_NAMESPACE,
      filter
    );

    return results.map((r) => ({
      id: r.id,
      text: r.metadata.text || "",
      score: r.score,
      artifactId: r.metadata.artifactId as string,
      filename: r.metadata.filename as string,
    }));
  }

  /**
   * Delete all embeddings for an artifact
   */
  async deleteArtifactEmbeddings(artifactId: string): Promise<void> {
    console.log(`[ArtifactEmbedding] Deleting embeddings for artifact: ${artifactId}`);

    // Get artifact to find pinecone IDs
    const [artifact] = await db
      .select({ pineconeIds: schema.artifacts.pineconeIds })
      .from(schema.artifacts)
      .where(eq(schema.artifacts.id, artifactId))
      .limit(1);

    if (!artifact || !artifact.pineconeIds) {
      console.log(`[ArtifactEmbedding] No embeddings found for artifact: ${artifactId}`);
      return;
    }

    const pineconeIds = artifact.pineconeIds as string[];
    if (pineconeIds.length === 0) {
      return;
    }

    // Delete from Pinecone
    await vectorService.deleteVectors(pineconeIds, ARTIFACT_NAMESPACE);

    console.log(
      `[ArtifactEmbedding] Deleted ${pineconeIds.length} vectors for artifact: ${artifactId}`
    );
  }

  /**
   * Delete embeddings for multiple artifacts
   */
  async deleteMultipleArtifactEmbeddings(artifactIds: string[]): Promise<void> {
    if (artifactIds.length === 0) return;

    // Get all artifacts to find pinecone IDs
    const artifacts = await db
      .select({ id: schema.artifacts.id, pineconeIds: schema.artifacts.pineconeIds })
      .from(schema.artifacts)
      .where(
        // Can't use inArray directly, so we'll loop
        eq(schema.artifacts.id, artifactIds[0])
      );

    // Collect all vector IDs
    const allVectorIds: string[] = [];
    for (const artifact of artifacts) {
      const pineconeIds = artifact.pineconeIds as string[];
      if (pineconeIds && pineconeIds.length > 0) {
        allVectorIds.push(...pineconeIds);
      }
    }

    if (allVectorIds.length > 0) {
      await vectorService.deleteVectors(allVectorIds, ARTIFACT_NAMESPACE);
      console.log(`[ArtifactEmbedding] Deleted ${allVectorIds.length} vectors`);
    }
  }

  /**
   * Update embedding status for an artifact
   */
  private async updateEmbeddingStatus(
    artifactId: string,
    status: "pending" | "processing" | "completed" | "failed" | "skipped"
  ): Promise<void> {
    await db
      .update(schema.artifacts)
      .set({
        embeddingStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(schema.artifacts.id, artifactId));
  }

  /**
   * Chunk text into smaller pieces for embedding
   * Chunks at paragraph boundaries when possible
   */
  private chunkText(text: string, maxChars: number, overlap: number): string[] {
    if (text.length <= maxChars) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxChars, text.length);

      // If not at the end, try to break at a paragraph or sentence boundary
      if (end < text.length) {
        // Look for paragraph break
        const lastParagraph = text.lastIndexOf("\n\n", end);
        if (lastParagraph > start + maxChars * 0.5) {
          end = lastParagraph;
        } else {
          // Try sentence break
          const lastSentence = text.lastIndexOf(". ", end);
          if (lastSentence > start + maxChars * 0.5) {
            end = lastSentence + 1;
          }
        }
      }

      chunks.push(text.slice(start, end).trim());

      // Next chunk starts with overlap (unless at the end)
      start = end - overlap;
      if (start < 0) start = 0;

      // Prevent infinite loop
      if (end >= text.length) break;
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  /**
   * Check if an artifact should have embeddings generated
   * (text must be extracted and long enough)
   */
  shouldGenerateEmbeddings(extractedText: string | null): boolean {
    // Skip if no text or too short
    if (!extractedText || extractedText.length < 100) {
      return false;
    }
    return true;
  }
}

// Export singleton
export const artifactEmbeddingService = new ArtifactEmbeddingService();
