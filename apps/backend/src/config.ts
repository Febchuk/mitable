import dotenv from "dotenv";
import minimist from "minimist";
import { createServer } from "net";

dotenv.config();

// Parse CLI arguments
// Supported flags: --backend-port, --port
const argv = minimist(process.argv.slice(2));

// Determine port with priority: CLI args > PORT env var > 3000
const getPort = (): number => {
  const cliPort = argv["backend-port"] || argv.port;
  if (cliPort) {
    const parsed = parseInt(String(cliPort), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`Invalid port number: ${cliPort}. Port must be between 1 and 65535.`);
    }
    return parsed;
  }

  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }

  return 3000;
};

const PORT = getPort();

export const config = {
  port: PORT,
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

  // OpenAI Configuration (for embeddings only)
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || "").trim(),
    embeddingModel: "text-embedding-3-small", // 1536 dimensions
    chatModel: (process.env.OPENAI_CHAT_MODEL || "gpt-4-turbo-preview").trim(),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "2000", 10),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.7"),
  },

  // Groq Configuration (for chat completions)
  groq: {
    apiKey: (process.env.GROQ_API_KEY || "").trim(),
    chatModel: (process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b").trim(),
    maxTokens: parseInt(process.env.GROQ_MAX_TOKENS || "8000", 10),
    temperature: parseFloat(process.env.GROQ_TEMPERATURE || "0.7"),
  },

  // Anthropic Configuration (for Storyteller summarization — Claude Sonnet 4.5 with extended thinking)
  anthropic: {
    apiKey: (process.env.ANTHROPIC_API_KEY || "").trim(),
  },

  // DeepSeek Configuration (fallback for Storyteller — DeepSeek R1 reasoning model)
  deepseek: {
    apiKey: (process.env.DEEPSEEK_API_KEY || "").trim(),
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
    redirectUri: (
      process.env.SLACK_REDIRECT_URI || `http://localhost:${PORT}/api/integrations/slack/callback`
    ).trim(),
  },

  // Notion OAuth Configuration
  notion: {
    clientId: (process.env.NOTION_CLIENT_ID || "").trim(),
    clientSecret: (process.env.NOTION_CLIENT_SECRET || "").trim(),
    redirectUri: (
      process.env.NOTION_REDIRECT_URI || `http://localhost:${PORT}/api/integrations/notion/callback`
    ).trim(),
    userRedirectUri: (
      process.env.NOTION_USER_REDIRECT_URI ||
      `http://localhost:${PORT}/api/integrations/notion/user/callback`
    ).trim(),
    // Notion uses versioned API - must include in all requests
    apiVersion: "2022-06-28",
  },

  // GitHub App Configuration
  github: {
    appId: parseInt(process.env.GITHUB_APP_ID || "0", 10),
    clientId: (process.env.GITHUB_APP_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GITHUB_APP_CLIENT_SECRET || "").trim(),
    appSlug: (process.env.GITHUB_APP_SLUG || "").trim(),
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY || "").trim(),
    installationRedirectUri: (
      process.env.GITHUB_APP_REDIRECT_URI ||
      `http://localhost:${PORT}/api/integrations/github/callback`
    ).trim(),
  },

  // Linear OAuth Configuration (per-user auth for session updates)
  linear: {
    clientId: (process.env.LINEAR_CLIENT_ID || "").trim(),
    clientSecret: (process.env.LINEAR_CLIENT_SECRET || "").trim(),
    redirectUri: (
      process.env.LINEAR_REDIRECT_URI || `http://localhost:${PORT}/api/integrations/linear/callback`
    ).trim(),
  },

  // Gmail OAuth Configuration (per-user email sending)
  gmail: {
    clientId: (process.env.GMAIL_CLIENT_ID || "").trim(),
    clientSecret: (process.env.GMAIL_CLIENT_SECRET || "").trim(),
    redirectUri: (
      process.env.GMAIL_REDIRECT_URI || `http://localhost:${PORT}/api/integrations/gmail/callback`
    ).trim(),
  },

  // Google Cloud DLP Configuration (for PII redaction)
  googleCloud: {
    projectId: (process.env.GOOGLE_CLOUD_PROJECT_ID || "").trim(),
    keyPath: (process.env.GOOGLE_CLOUD_KEY_PATH || "").trim(),
  },

  // Stripe Configuration
  stripe: {
    secretKey: (process.env.STRIPE_SECRET_KEY || "").trim(),
    webhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    proPriceId: (process.env.STRIPE_PRO_PRICE_ID || "").trim(),
    teamPriceId: (process.env.STRIPE_TEAM_PRICE_ID || "").trim(),
  },

  // Billing Configuration
  billing: {
    // Internal domains that bypass quota limits (test accounts)
    internalDomains: ["lorikeet.ai", "mitable.ai", "mitable.dev"],
    // Default tier for new organizations during beta
    defaultTier: "team" as const,
    // Feature flags by tier
    tierFeatures: {
      free: ["basic_ai", "basic_search"],
      pro: ["basic_ai", "basic_search", "export_data", "priority_support"],
      team: [
        "basic_ai",
        "basic_search",
        "export_data",
        "priority_support",
        "sso",
        "api_access",
        "audit_logs",
        "unlimited_ai",
        "unlimited_storage",
      ],
    },
  },

  // Deepgram Configuration (Audio Transcription)
  deepgram: {
    apiKey: (process.env.DEEPGRAM_API_KEY || "").trim(),
  },

  // Backend URL (used for password reset redirects, etc.)
  backendUrl: (process.env.BACKEND_URL || `http://localhost:${PORT}`).trim(),

  // Security
  jwtSecret: process.env.JWT_SECRET || "",

  // CORS Configuration
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3003")
      .split(",")
      .map((origin) => origin.trim()),
  },
};

// Validate required environment variables
export function validateConfig() {
  const required = [
    { key: "DATABASE_URL", value: config.database.url },
    { key: "SUPABASE_URL", value: config.supabase.url },
    { key: "SUPABASE_ANON_KEY", value: config.supabase.anonKey },
    { key: "OPENAI_API_KEY", value: config.openai.apiKey },
    { key: "GROQ_API_KEY", value: config.groq.apiKey },
    { key: "PINECONE_API_KEY", value: config.pinecone.apiKey },
    { key: "PINECONE_INDEX_NAME", value: config.pinecone.indexName },
    { key: "GEMINI_API_KEY", value: config.gemini.apiKey },
    { key: "SLACK_CLIENT_ID", value: config.slack.clientId },
    { key: "SLACK_CLIENT_SECRET", value: config.slack.clientSecret },
    { key: "NOTION_CLIENT_ID", value: config.notion.clientId },
    { key: "NOTION_CLIENT_SECRET", value: config.notion.clientSecret },
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

/**
 * Check if a port is available
 * Returns a promise that resolves to true if available, false if in use
 */
export function checkPortAvailability(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        // Other errors (permission, etc.) - treat as unavailable
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

// Validate config on module load in production
if (config.nodeEnv === "production") {
  if (!validateConfig()) {
    process.exit(1);
  }
}
