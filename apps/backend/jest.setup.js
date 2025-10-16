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
process.env.JWT_SECRET = "test-jwt-secret";
