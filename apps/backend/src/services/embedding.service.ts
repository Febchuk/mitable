import OpenAI from "openai";
import { config } from "../config.js";

/**
 * Embedding Service
 * Wraps OpenAI API to generate text embeddings
 */
class EmbeddingService {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.model = config.openai.embeddingModel;
  }

  /**
   * Generate embedding for a single text input
   * @param text - Text to embed
   * @returns Promise resolving to embedding vector (1536 dimensions)
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Generate embeddings for multiple text inputs
   * @param texts - Array of texts to embed
   * @returns Promise resolving to array of embedding vectors
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw new Error("Failed to generate embeddings");
    }
  }

  /**
   * Get embedding dimensions for the current model
   * @returns Number of dimensions (1536 for text-embedding-3-small)
   */
  getDimensions(): number {
    return 1536; // text-embedding-3-small dimension
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
