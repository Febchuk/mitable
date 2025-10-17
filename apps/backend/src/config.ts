import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || "",
    directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },

  // Supabase Configuration
  supabase: {
    url: (process.env.SUPABASE_URL || "").trim(),
    anonKey: (process.env.SUPABASE_ANON_KEY || "").trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  },

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
    apiKey: (process.env.GEMINI_API_KEY || "").trim(),
  },

  // Slack OAuth Configuration
  slack: {
    clientId: (process.env.SLACK_CLIENT_ID || "").trim(),
    clientSecret: (process.env.SLACK_CLIENT_SECRET || "").trim(),
    redirectUri: (process.env.SLACK_REDIRECT_URI || "http://localhost:3000/api/integrations/slack/callback").trim(),
  },

  // Security
  jwtSecret: process.env.JWT_SECRET || "",
};

// Validate required environment variables
export function validateConfig() {
  const required = [
    { key: "DATABASE_URL", value: config.database.url },
    { key: "SUPABASE_URL", value: config.supabase.url },
    { key: "SUPABASE_ANON_KEY", value: config.supabase.anonKey },
    { key: "OPENAI_API_KEY", value: config.openai.apiKey },
    { key: "PINECONE_API_KEY", value: config.pinecone.apiKey },
    { key: "PINECONE_INDEX_NAME", value: config.pinecone.indexName },
    { key: "GEMINI_API_KEY", value: config.gemini.apiKey },
    { key: "JWT_SECRET", value: config.jwtSecret },
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

// Validate config on module load in production
if (config.nodeEnv === "production") {
  if (!validateConfig()) {
    process.exit(1);
  }
}
