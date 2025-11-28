/**
 * Jest Setup File
 * Runs before all tests to set up the test environment
 */

// Set up test environment variables
process.env.NODE_ENV = "test";
process.env.PORT = "3001";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.PINECONE_API_KEY = "test-pinecone-key";
process.env.PINECONE_INDEX_NAME = "test-index";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GROQ_API_KEY = "test-groq-key";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 hex chars (32 bytes) for AES-256
process.env.GITHUB_APP_ID = "123456";
process.env.GITHUB_APP_CLIENT_ID = "test-github-client-id";
process.env.GITHUB_APP_CLIENT_SECRET = "test-github-client-secret";
process.env.GITHUB_APP_PRIVATE_KEY =
  "-----BEGIN RSA PRIVATE KEY-----\ntest-key\n-----END RSA PRIVATE KEY-----";
process.env.GITHUB_APP_SLUG = "test-app";
