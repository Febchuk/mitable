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

  // Gemini Configuration
  gemini: {
    apiKey: (process.env.GEMINI_API_KEY || "").trim(),
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
    { key: "GEMINI_API_KEY", value: config.gemini.apiKey },
    { key: "JWT_SECRET", value: config.jwtSecret },
  ];

  const missing = required.filter((item) => !item.value);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((item) => console.error(`   - ${item.key}`));
    console.error("\nPlease check your .env file.");
    return false;
  }

  console.log("✅ All required environment variables are set");
  return true;
}

// Validate config on module load in production
if (config.nodeEnv === "production") {
  if (!validateConfig()) {
    process.exit(1);
  }
}
