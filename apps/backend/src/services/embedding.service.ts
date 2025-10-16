import OpenAI from "openai";
import { config, validateVectorDimensions } from "../config.js";

/**
 * Model dimension mapping
 * Maps OpenAI embedding model names to their vector dimensions
 */
export const MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

/**
 * Embedding Service
 * Wraps OpenAI API to generate text embeddings
 */
class EmbeddingService {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured. Please set it in your .env file.");
    }

    this.model = config.openai.embeddingModel;

    // Validate model is supported
    if (!MODEL_DIMENSIONS[this.model]) {
      throw new Error(
        `Unsupported embedding model: ${this.model}. ` +
          `Supported models: ${Object.keys(MODEL_DIMENSIONS).join(", ")}`
      );
    }

    // Validate embedding dimensions match Pinecone index dimensions
    const embeddingDimensions = MODEL_DIMENSIONS[this.model];
    validateVectorDimensions(embeddingDimensions);

    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  /**
   * Generate embedding for a single text input
   * @param text - Text to embed
   * @returns Promise resolving to embedding vector (dimensions depend on model)
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new Error("Failed to generate embedding", { cause: error });
    }
  }

  /**
   * Generate embeddings for multiple text inputs
   * Automatically chunks large batches to respect OpenAI API limits:
   * - Max 2048 inputs per request
   * - Each input max 8192 tokens
   * - Total request limit ~300K tokens
   *
   * @param texts - Array of texts to embed
   * @param chunkSize - Maximum number of texts per batch (default: 2048)
   * @returns Promise resolving to array of embedding vectors
   */
  async embedTexts(texts: string[], chunkSize: number = 2048): Promise<number[][]> {
    // Handle empty input
    if (texts.length === 0) {
      return [];
    }

    // If within batch size limit, process directly
    if (texts.length <= chunkSize) {
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: texts,
        });

        return response.data.map((item) => item.embedding);
      } catch (error) {
        throw new Error("Failed to generate embeddings", { cause: error });
      }
    }

    // For large batches, chunk and process sequentially
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);

      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: chunk,
        });

        const embeddings = response.data.map((item) => item.embedding);
        allEmbeddings.push(...embeddings);
      } catch (error) {
        throw new Error(
          `Failed to generate embeddings for chunk ${Math.floor(i / chunkSize) + 1}`,
          { cause: error }
        );
      }
    }

    return allEmbeddings;
  }

  /**
   * Get embedding dimensions for the current model
   * @returns Number of dimensions based on the configured model
   * @throws Error if model is not recognized
   */
  getDimensions(): number {
    const dimensions = MODEL_DIMENSIONS[this.model];
    if (!dimensions) {
      throw new Error(
        `Unknown embedding model: ${this.model}. ` +
          `Supported models: ${Object.keys(MODEL_DIMENSIONS).join(", ")}`
      );
    }
    return dimensions;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
