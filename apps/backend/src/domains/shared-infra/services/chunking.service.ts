import { get_encoding } from "tiktoken";
import { TextDecoder } from "util";

const CHUNK_CONFIG = {
  MIN_TOKENS: 500,
  MAX_TOKENS: 1000,
  OVERLAP_TOKENS: 100,
} as const;

export interface TextChunk {
  text: string;
  tokenCount: number;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Chunking Service
 * Intelligently splits text into token-based chunks with overlap
 */
class ChunkingService {
  private encoding;
  private decoder: TextDecoder;

  constructor() {
    this.encoding = get_encoding("cl100k_base");
    this.decoder = new TextDecoder();
  }

  /**
   * Count tokens in a text string
   * @param text - Text to count tokens for
   * @returns Number of tokens
   */
  countTokens(text: string): number {
    return this.encoding.encode(text).length;
  }

  /**
   * Chunk text into overlapping segments based on token count
   * @param text - Text to chunk
   * @returns Array of text chunks with metadata
   */
  chunkText(text: string): TextChunk[] {
    if (!text) {
      return [{ text: "", tokenCount: 0, chunkIndex: 0, totalChunks: 1 }];
    }

    const tokens = this.encoding.encode(text);

    if (tokens.length <= CHUNK_CONFIG.MAX_TOKENS) {
      return [
        {
          text,
          tokenCount: tokens.length,
          chunkIndex: 0,
          totalChunks: 1,
        },
      ];
    }

    const chunks: TextChunk[] = [];
    let startTokenIndex = 0;

    while (startTokenIndex < tokens.length) {
      const endTokenIndex = Math.min(startTokenIndex + CHUNK_CONFIG.MAX_TOKENS, tokens.length);

      const chunkTokens = tokens.slice(startTokenIndex, endTokenIndex);
      const chunkBytes = this.encoding.decode(chunkTokens);
      const chunkText = this.decoder.decode(chunkBytes);

      chunks.push({
        text: chunkText,
        tokenCount: chunkTokens.length,
        chunkIndex: chunks.length,
        totalChunks: 0,
      });

      startTokenIndex += CHUNK_CONFIG.MAX_TOKENS - CHUNK_CONFIG.OVERLAP_TOKENS;
    }

    return chunks.map((chunk) => ({
      ...chunk,
      totalChunks: chunks.length,
    }));
  }

  /**
   * Batch chunk multiple texts
   * @param texts - Array of texts to chunk
   * @returns Array of arrays of chunks (one array per input text)
   */
  chunkTexts(texts: string[]): TextChunk[][] {
    return texts.map((text) => this.chunkText(text));
  }
}

export const chunkingService = new ChunkingService();
