import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";

const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 2,
  INITIAL_DELAY_MS: 1000,
} as const;

/**
 * Vector metadata structure
 * TODO: Replace index signature with specific typed fields as requirements grow
 * to maintain type safety across the application
 */
export interface VectorMetadata {
  text: string;
  source?: string;
  timestamp?: number;
  // TODO: Remove this index signature and add specific typed fields
  [key: string]: any;
}

/**
 * Vector record to upsert
 */
export interface VectorRecord {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

/**
 * Query result from Pinecone
 */
export interface QueryResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

/**
 * Vector Service
 * Wraps Pinecone client for vector storage and retrieval
 */
class VectorService {
  private client: Pinecone;
  private indexName: string;
  private initialized: boolean = false;

  constructor() {
    if (!config.pinecone.apiKey) {
      throw new Error("PINECONE_API_KEY is not configured. Please set it in your .env file.");
    }

    if (!config.pinecone.indexName) {
      throw new Error("PINECONE_INDEX_NAME is not configured. Please set it in your .env file.");
    }

    this.client = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
    this.indexName = config.pinecone.indexName;
  }

  /**
   * Initialize the vector service
   * Note: Assumes the Pinecone index already exists and is configured remotely
   */
  initialize() {
    this.initialized = true;
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRateLimitError =
          error instanceof Error &&
          (error.message.includes("rate limit") || error.message.includes("429"));

        const isLastAttempt = attempt === RETRY_CONFIG.MAX_RETRIES - 1;

        if (isLastAttempt) {
          break;
        }

        if (isRateLimitError) {
          const delayMs =
            RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt);
          console.log(
            `[VectorService] Rate limit hit, retrying ${context} in ${delayMs}ms (attempt ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES})`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          throw error;
        }
      }
    }

    throw new Error(`${context} failed after ${RETRY_CONFIG.MAX_RETRIES} attempts`, {
      cause: lastError,
    });
  }

  /**
   * Upsert vectors into Pinecone index
   * @param vectors - Array of vector records to upsert
   * @param namespace - Optional namespace for organizing vectors
   */
  async upsertVectors(vectors: VectorRecord[], namespace?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    return this.retryWithBackoff(async () => {
      const index = this.client.index(this.indexName);
      await index.namespace(namespace || "").upsert(vectors);
    }, `upsertVectors (${vectors.length} vectors)`);
  }

  /**
   * Query vectors from Pinecone index
   * @param embedding - Query embedding vector
   * @param topK - Number of results to return (default: 10)
   * @param namespace - Optional namespace to query
   * @param filter - Optional metadata filter
   * @returns Array of similar vectors with scores
   */
  async queryVectors(
    embedding: number[],
    topK: number = 10,
    namespace?: string,
    filter?: Record<string, any>
  ): Promise<QueryResult[]> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    return this.retryWithBackoff(async () => {
      const index = this.client.index(this.indexName);
      const results = await index.namespace(namespace || "").query({
        vector: embedding,
        topK,
        includeMetadata: true,
        filter,
      });

      return (
        results.matches?.map((match) => ({
          id: match.id,
          score: match.score || 0,
          metadata: (match.metadata as VectorMetadata) || { text: "" },
        })) || []
      );
    }, `queryVectors (topK=${topK})`);
  }

  /**
   * Delete vectors by IDs
   * @param ids - Array of vector IDs to delete
   * @param namespace - Optional namespace
   */
  async deleteVectors(ids: string[], namespace?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    return this.retryWithBackoff(async () => {
      const index = this.client.index(this.indexName);
      await index.namespace(namespace || "").deleteMany(ids);
    }, `deleteVectors (${ids.length} ids)`);
  }

  /**
   * Delete all vectors in a namespace
   * @param namespace - Namespace to clear
   */
  async clearNamespace(namespace: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    return this.retryWithBackoff(async () => {
      const index = this.client.index(this.indexName);
      await index.namespace(namespace).deleteAll();
    }, `clearNamespace (${namespace})`);
  }

  /**
   * Get index stats
   */
  async getStats(): Promise<any> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    return this.retryWithBackoff(async () => {
      const index = this.client.index(this.indexName);
      return await index.describeIndexStats();
    }, "getStats");
  }
}

// Export singleton instance
export const vectorService = new VectorService();
