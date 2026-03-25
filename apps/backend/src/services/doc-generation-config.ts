/**
 * Document Generation Configuration
 *
 * Centralized constants for RAG-based document generation
 */

// Model configuration
// Primary: Claude Sonnet 4.5, Fallback: GPT-5, Last resort: DeepSeek
// Actual model selection handled by document-generation/agent.ts fallback chain
export const DOC_GEN_MODEL = "claude-sonnet-4-5-20250929";
export const DOC_GEN_TEMPERATURE = 0.5;
export const DOC_GEN_MAX_TOKENS = 16000;

// RAG retrieval configuration
export const SESSION_SEARCH_TOP_K = 30; // Number of session chunks to retrieve
export const SESSION_SEARCH_MIN_SIMILARITY = 0.3; // Minimum cosine similarity threshold

// Streaming configuration
export const STREAM_CHUNK_SIZE = 50; // Characters per chunk when streaming to client
