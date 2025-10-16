import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // OpenAI Configuration
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || "").trim(),
    embeddingModel: "text-embedding-3-small", // 1536 dimensions
  },

  // Pinecone Configuration
  pinecone: {
    apiKey: (process.env.PINECONE_API_KEY || "").trim(),
    indexName: (process.env.PINECONE_INDEX_NAME || "mitable-embeddings").trim(),
  },

  // Vector Configuration
  // IMPORTANT: This must match your Pinecone index dimension configuration
  // Changing the embedding model requires recreating the Pinecone index with matching dimensions
  vectorDimensions: 1536,

  // Gemini Configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
  },

  // Security
  jwtSecret: process.env.JWT_SECRET || "",
};

// Validate required environment variables
export function validateConfig() {
  const required = [
    { key: "OPENAI_API_KEY", value: config.openai.apiKey },
    { key: "PINECONE_API_KEY", value: config.pinecone.apiKey },
    { key: "PINECONE_INDEX_NAME", value: config.pinecone.indexName },
  ];

  const missing = required.filter((item) => !item.value);

  if (missing.length > 0) {
    const missingKeys = missing.map((item) => item.key).join(", ");
    throw new Error(
      `Missing required environment variables: ${missingKeys}. ` +
      `Please check your .env file and ensure all required keys are set.`
    );
  }

  return true;
}

/**
 * Validate that embedding model dimensions match Pinecone index dimensions
 * Must be called after embedding service is initialized
 */
export function validateVectorDimensions(embeddingDimensions: number) {
  if (embeddingDimensions !== config.vectorDimensions) {
    throw new Error(
      `Embedding model dimension mismatch! ` +
      `Embedding model "${config.openai.embeddingModel}" produces ${embeddingDimensions}D vectors, ` +
      `but Pinecone index is configured for ${config.vectorDimensions}D vectors. ` +
      `Either change the embedding model or recreate the Pinecone index with matching dimensions.`
    );
  }
}
