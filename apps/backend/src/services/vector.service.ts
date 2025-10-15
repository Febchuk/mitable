import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";

/**
 * Vector metadata structure
 */
export interface VectorMetadata {
  text: string;
  source?: string;
  timestamp?: number;
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
    this.client = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
    this.indexName = config.pinecone.indexName;
  }

  /**
   * Initialize Pinecone index (create if doesn't exist)
   * @param dimension - Vector dimension (default: 1536 for OpenAI embeddings)
   * @param metric - Distance metric (default: cosine)
   * @param region - AWS region for serverless index (default: us-east-1)
   * @param skipCreation - If true, only verify connection, don't create index
   */
  async initialize(
    dimension: number = 1536,
    metric: "cosine" | "euclidean" | "dotproduct" = "cosine",
    region: string = "us-east-1",
    skipCreation: boolean = false
  ) {
    try {
      if (skipCreation) {
        // Just mark as initialized - assume index exists
        console.log(`✅ Using existing Pinecone index: ${this.indexName}`);
        this.initialized = true;
        return;
      }

      // Check if index exists
      const indexes = await this.client.listIndexes();
      const indexExists = indexes.indexes?.some((idx) => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`📊 Creating Pinecone index: ${this.indexName}`);
        await this.client.createIndex({
          name: this.indexName,
          dimension,
          metric,
          spec: {
            serverless: {
              cloud: "aws",
              region: region,
            },
          },
        });
        console.log(`✅ Pinecone index created: ${this.indexName}`);
      } else {
        console.log(`✅ Pinecone index already exists: ${this.indexName}`);
      }

      this.initialized = true;
    } catch (error) {
      console.error("Error initializing Pinecone:", error);
      throw new Error("Failed to initialize vector database");
    }
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
      console.log(`✅ Upserted ${vectors.length} vectors to Pinecone`);
    } catch (error) {
      console.error("Error upserting vectors:", error);
      throw new Error("Failed to upsert vectors");
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
      console.error("Error querying vectors:", error);
      throw new Error("Failed to query vectors");
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
      console.log(`✅ Deleted ${ids.length} vectors from Pinecone`);
    } catch (error) {
      console.error("Error deleting vectors:", error);
      throw new Error("Failed to delete vectors");
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
      console.log(`✅ Cleared namespace: ${namespace}`);
    } catch (error) {
      console.error("Error clearing namespace:", error);
      throw new Error("Failed to clear namespace");
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
      console.error("Error getting index stats:", error);
      throw new Error("Failed to get index stats");
    }
  }
}

// Export singleton instance
export const vectorService = new VectorService();
