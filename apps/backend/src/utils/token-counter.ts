import { encoding_for_model } from "tiktoken";

/**
 * Token Counter Utility
 *
 * Uses tiktoken (OpenAI's official tokenizer) to count tokens accurately.
 * Ensures RAG context stays within the 4000 token limit.
 *
 * Future: When migrating to Llama Maverick/Behemoth (1M+ tokens), this limit can be increased or removed.
 */

const MAX_CONTEXT_TOKENS = 4000;

class TokenCounter {
  private encoder;

  constructor() {
    // Use GPT-4 encoder (same tokenization as GPT-4)
    this.encoder = encoding_for_model("gpt-4");
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    try {
      const tokens = this.encoder.encode(text);
      return tokens.length;
    } catch (error) {
      // Fallback to approximation if encoding fails
      console.warn("[TokenCounter] Encoding failed, using approximation", error);
      return Math.ceil(text.length / 4); // Rough approximation: 1 token ≈ 4 chars
    }
  }

  /**
   * Check if text exceeds token limit
   */
  exceedsLimit(text: string, limit: number = MAX_CONTEXT_TOKENS): boolean {
    return this.countTokens(text) > limit;
  }

  /**
   * Truncate text to fit within token limit
   * Preserves complete words
   */
  truncateToTokenLimit(text: string, maxTokens: number = MAX_CONTEXT_TOKENS): string {
    const currentTokens = this.countTokens(text);

    if (currentTokens <= maxTokens) {
      return text; // Already within limit
    }

    // Binary search to find the right length
    let left = 0;
    let right = text.length;
    let bestLength = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const substring = text.substring(0, mid);
      const tokens = this.countTokens(substring);

      if (tokens <= maxTokens) {
        bestLength = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Truncate at word boundary
    let truncated = text.substring(0, bestLength);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 0) {
      truncated = truncated.substring(0, lastSpace);
    }

    return truncated + "...";
  }

  /**
   * Truncate array of text items to fit within token limit
   * Keeps as many complete items as possible
   */
  truncateArrayToTokenLimit<T extends { text: string }>(
    items: T[],
    maxTokens: number = MAX_CONTEXT_TOKENS
  ): { truncated: T[]; removedCount: number; finalTokenCount: number } {
    let totalTokens = 0;
    const truncated: T[] = [];

    for (const item of items) {
      const itemTokens = this.countTokens(item.text);

      if (totalTokens + itemTokens <= maxTokens) {
        // Full item fits
        truncated.push(item);
        totalTokens += itemTokens;
      } else {
        // Try to fit partial item
        const remainingTokens = maxTokens - totalTokens;

        if (remainingTokens > 100) {
          // Only include partial if we have meaningful space left
          const truncatedText = this.truncateToTokenLimit(item.text, remainingTokens);
          truncated.push({ ...item, text: truncatedText });
          totalTokens += this.countTokens(truncatedText);
        }

        break; // Stop adding more items
      }
    }

    return {
      truncated,
      removedCount: items.length - truncated.length,
      finalTokenCount: totalTokens,
    };
  }

  /**
   * Clean up encoder resources
   */
  cleanup(): void {
    this.encoder.free();
  }
}

// Export singleton
export const tokenCounter = new TokenCounter();

// Export constant for reuse
export { MAX_CONTEXT_TOKENS };
