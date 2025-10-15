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
    console.warn("⚠️  Missing environment variables:", missing.map((item) => item.key).join(", "));
    console.warn("⚠️  Vector database features will be disabled");
  }

  return missing.length === 0;
}
