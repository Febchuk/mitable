import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";

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

  /**
   * Upsert vectors into Pinecone index
   * @param vectors - Array of vector records to upsert
   * @param namespace - Optional namespace for organizing vectors
   */
  async upsertVectors(vectors: VectorRecord[], namespace?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    try {
      const index = this.client.index(this.indexName);
      await index.namespace(namespace || "").upsert(vectors);
    } catch (error) {
      throw new Error("Failed to upsert vectors", { cause: error });
    }
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

    try {
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
    } catch (error) {
      throw new Error("Failed to query vectors", { cause: error });
    }
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

    try {
      const index = this.client.index(this.indexName);
      await index.namespace(namespace || "").deleteMany(ids);
    } catch (error) {
      throw new Error("Failed to delete vectors", { cause: error });
    }
  }

  /**
   * Delete all vectors in a namespace
   * @param namespace - Namespace to clear
   */
  async clearNamespace(namespace: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    try {
      const index = this.client.index(this.indexName);
      await index.namespace(namespace).deleteAll();
    } catch (error) {
      throw new Error("Failed to clear namespace", { cause: error });
    }
  }

  /**
   * Get index stats
   */
  async getStats(): Promise<any> {
    if (!this.initialized) {
      throw new Error("VectorService not initialized. Call initialize() first.");
    }

    try {
      const index = this.client.index(this.indexName);
      return await index.describeIndexStats();
    } catch (error) {
      throw new Error("Failed to get index stats", { cause: error });
    }
  }
}

// Export singleton instance
export const vectorService = new VectorService();
