import OpenAI from "openai";
import { config, validateVectorDimensions } from "../config.js";

const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 2,
  INITIAL_DELAY_MS: 1000,
} as const;

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

  private async retryWithBackoff<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRateLimitError =
          error instanceof Error && "status" in error && error.status === 429;

        const isLastAttempt = attempt === RETRY_CONFIG.MAX_RETRIES - 1;

        if (isLastAttempt) {
          break;
        }

        if (isRateLimitError || (error instanceof Error && error.message.includes("rate limit"))) {
          const delayMs =
            RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt);
          console.log(
            `[EmbeddingService] Rate limit hit, retrying ${context} in ${delayMs}ms (attempt ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES})`
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
   * Generate embedding for a single text input
   * @param text - Text to embed
   * @returns Promise resolving to embedding vector (dimensions depend on model)
   */
  async embedText(text: string): Promise<number[]> {
    return this.retryWithBackoff(async () => {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });
      return response.data[0].embedding;
    }, "embedText");
  }

  /**
   * Estimate token count for a text (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate embeddings for multiple text inputs
   * Automatically chunks large batches to respect OpenAI API limits:
   * - Max 2048 inputs per request
   * - Each input max 8192 tokens
   * - Total request limit 8192 tokens per batch (conservative for safety)
   *
   * @param texts - Array of texts to embed
   * @returns Promise resolving to array of embedding vectors
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    // Handle empty input
    if (texts.length === 0) {
      return [];
    }

    const MAX_TOKENS_PER_BATCH = 8000; // Conservative limit (8192 is max)
    const MAX_TEXTS_PER_BATCH = 2048;

    const allEmbeddings: number[][] = [];
    let currentBatch: string[] = [];
    let currentBatchTokens = 0;

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const estimatedTokens = this.estimateTokens(text);

      // Check if adding this text would exceed limits
      const wouldExceedTokens = currentBatchTokens + estimatedTokens > MAX_TOKENS_PER_BATCH;
      const wouldExceedCount = currentBatch.length >= MAX_TEXTS_PER_BATCH;

      // If batch is full, process it
      if (currentBatch.length > 0 && (wouldExceedTokens || wouldExceedCount)) {
        const chunkNumber = Math.floor(allEmbeddings.length / MAX_TEXTS_PER_BATCH) + 1;
        console.log(
          `         📦 Embedding batch ${chunkNumber}: ${currentBatch.length} chunks (~${currentBatchTokens} tokens)`
        );

        const embeddings = await this.retryWithBackoff(async () => {
          const response = await this.client.embeddings.create({
            model: this.model,
            input: currentBatch,
          });
          return response.data.map((item) => item.embedding);
        }, `embedTexts batch ${chunkNumber}`);

        allEmbeddings.push(...embeddings);

        // Reset batch
        currentBatch = [];
        currentBatchTokens = 0;
      }

      // Add current text to batch
      currentBatch.push(text);
      currentBatchTokens += estimatedTokens;
    }

    // Process final batch if not empty
    if (currentBatch.length > 0) {
      const chunkNumber = Math.floor(allEmbeddings.length / MAX_TEXTS_PER_BATCH) + 1;
      console.log(
        `         📦 Embedding batch ${chunkNumber}: ${currentBatch.length} chunks (~${currentBatchTokens} tokens)`
      );

      const embeddings = await this.retryWithBackoff(async () => {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: currentBatch,
        });
        return response.data.map((item) => item.embedding);
      }, `embedTexts batch ${chunkNumber}`);

      allEmbeddings.push(...embeddings);
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
