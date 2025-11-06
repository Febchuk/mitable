#!/usr/bin/env ts-node
/**
 * Query Test Runner
 *
 * Reads queries from Queries_test.md, sends them to the backend API,
 * and outputs results to output.md
 *
 * Usage:
 *   npm run test:queries              # Sequential
 *   npm run test:queries:parallel     # Parallel (faster)
 *   npx tsx query_test/run-tests.ts --parallel
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent .env
dotenv.config({ path: path.join(__dirname, "../.env") });

const OUTPUT_FILE = path.join(__dirname, "output.md");
const API_URL = process.env.API_URL || "http://localhost:3000/api/conversations";
const PARALLEL = process.argv.includes("--parallel");
const MAX_CONCURRENT = 3; // Limit parallel requests to avoid overwhelming
// Use a fixed UUID for test conversation (so it gets reused across test runs)
const CONVERSATION_ID = process.env.CONVERSATION_ID || "00000000-0000-0000-0000-000000000001";
const AUTH_TOKEN = process.env.AUTH_TOKEN || ""; // JWT token for authentication
const DATABASE_URL = process.env.DATABASE_URL || "";

// User ID will be fetched from DB
let TEST_USER_ID: string | null = null;

interface TestResult {
  query: string;
  category: string;
  response: string;
  error?: string;
  duration: number;
}

// All test queries hardcoded
const ALL_QUERIES: Array<{ category: string; query: string }> = [
  // 1. Status / progress queries
  {
    category: "Status / progress",
    query: "What progress was made on the onboarding assistant last week?",
  },
  {
    category: "Status / progress",
    query: "What are the main blockers mentioned in engineering in October?",
  },
  { category: "Status / progress", query: "What was decided about the admin dashboard?" },
  { category: "Status / progress", query: "How did our PII redaction tests go in Q4?" },

  // 2. Procedural / how-to queries
  { category: "Procedural / how-to", query: "How do I set up the RAG environment locally?" },
  {
    category: "Procedural / how-to",
    query: "What's the process for creating a new dataset in Pinecone?",
  },
  {
    category: "Procedural / how-to",
    query: "How do we deploy a new version of the onboarding assistant?",
  },
  {
    category: "Procedural / how-to",
    query: "Where do we keep the credentials for Salesforce sandbox?",
  },

  // 3. Decision / rationale queries
  { category: "Decision / rationale", query: "Why did we switch to Grok OSS?" },
  { category: "Decision / rationale", query: "Why did we move PII redaction fully on-device?" },
  { category: "Decision / rationale", query: "Why are we prioritizing Lorikeet MVP?" },

  // 4. Cross-topic synthesis
  {
    category: "Cross-topic synthesis",
    query: "How are we handling data privacy across Mitable AI systems?",
  },
  {
    category: "Cross-topic synthesis",
    query: "What's the relationship between the onboarding assistant and the RAG architecture?",
  },
  { category: "Cross-topic synthesis", query: "What external partners are we evaluating and why?" },

  // 5. Temporal change / comparison
  {
    category: "Temporal change / comparison",
    query: "How did our focus shift from September to October?",
  },
  {
    category: "Temporal change / comparison",
    query: "What were the biggest new initiatives in Q4 compared to Q3?",
  },
  {
    category: "Temporal change / comparison",
    query: "What updates were made to the AI orchestration pipeline in October?",
  },

  // 6. Knowledge-gap fallbacks
  { category: "Knowledge-gap fallbacks", query: "What is a vector database?" },
  {
    category: "Knowledge-gap fallbacks",
    query: "Explain how Grok OSS differs from OpenAI models.",
  },
  { category: "Knowledge-gap fallbacks", query: "What's LangChain used for?" },

  // 7. Detail-expansion prompts
  {
    category: "Detail-expansion prompts",
    query: "Give me details on the onboarding assistant part.",
  },
  { category: "Detail-expansion prompts", query: "Expand #engineering threads." },
  {
    category: "Detail-expansion prompts",
    query: "Show raw notes for the sandboxed session discussion.",
  },

  // 8. Ambiguous or incomplete queries
  { category: "Ambiguous or incomplete", query: "What's new?" },
  { category: "Ambiguous or incomplete", query: "Any updates?" },
  { category: "Ambiguous or incomplete", query: "Can you summarize everything?" },
];

/**
 * Extract queries from the test file
 */
function extractQueries(content: string): Array<{ category: string; query: string }> {
  const lines = content.split("\n");
  const queries: Array<{ category: string; query: string }> = [];
  let currentCategory = "Unknown";

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detect category headers (e.g., "1. Status / progress queries")
    const categoryMatch = trimmedLine.match(/^\d+\.\s+(.+?)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].replace(/\s+queries$/i, "").trim();
      continue;
    }

    // Extract queries in quotes (support all quote types)
    // Check if line starts with a quote character
    if (trimmedLine.length > 2) {
      const firstChar = trimmedLine[0];
      const lastChar = trimmedLine[trimmedLine.length - 1];

      // Check for matching quotes: ", ", ", ", ', '
      const quoteChars = ['"', '"', '"', "'", "'"];
      if (quoteChars.includes(firstChar) && quoteChars.includes(lastChar)) {
        const query = trimmedLine.slice(1, -1); // Remove first and last char
        queries.push({
          category: currentCategory,
          query: query,
        });
      }
    }
  }

  return queries;
}

/**
 * Send a query to the backend API and get the full response
 */
async function queryAPI(query: string): Promise<string> {
  try {
    // First, create or get conversation
    const convUrl = `${API_URL}/${CONVERSATION_ID}`;

    // Send message to conversation stream endpoint
    const streamUrl = `${convUrl}/messages/stream`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth token if provided
    if (AUTH_TOKEN) {
      headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
    }

    const response = await fetch(streamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: query,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Read the streaming response with proper buffering
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let fullResponse = "";
    let buffer = ""; // Buffer for incomplete lines

    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from buffer
        const lines = buffer.split("\n");

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        // Process complete lines
        for (const line of lines) {
          const trimmedLine = line.trim();

          if (trimmedLine.startsWith("data: ")) {
            const jsonStr = trimmedLine.slice(6); // Remove 'data: ' prefix
            if (jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "chunk" && data.content) {
                fullResponse += data.content;
              }
            } catch (e) {
              // Skip malformed JSON - but log for debugging
              // console.warn('Failed to parse SSE chunk:', jsonStr.substring(0, 50));
            }
          }
        }
      }

      if (done) break;
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith("data: ")) {
        const jsonStr = trimmedLine.slice(6);
        if (jsonStr !== "[DONE]") {
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === "chunk" && data.content) {
              fullResponse += data.content;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }

    return fullResponse.trim() || "[No content received]";
  } catch (error) {
    console.error(`Error querying "${query}":`, error);
    throw error;
  }
}

/**
 * Run a single test
 */
async function runTest(
  category: string,
  query: string,
  index: number,
  total: number
): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`[${index + 1}/${total}] Testing: "${query}"`);

  try {
    const response = await queryAPI(query);
    const duration = Date.now() - startTime;

    console.log(`  ✅ Completed in ${duration}ms`);

    return {
      query,
      category,
      response,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error(`  ❌ Failed: ${errorMsg}`);

    return {
      query,
      category,
      response: "",
      error: errorMsg,
      duration,
    };
  }
}

/**
 * Write incremental results to file
 */
function writeIncrementalResults(results: TestResult[], isComplete: boolean = false) {
  const output = generateOutput(results);
  fs.writeFileSync(OUTPUT_FILE, output, "utf-8");

  if (!isComplete) {
    console.log(`📝 Progress saved to: ${OUTPUT_FILE}`);
  }
}

/**
 * Run tests sequentially
 */
async function runSequential(
  queries: Array<{ category: string; query: string }>
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (let i = 0; i < queries.length; i++) {
    const { category, query } = queries[i];
    const result = await runTest(category, query, i, queries.length);
    results.push(result);

    // Write incrementally after each test
    writeIncrementalResults(results, false);
  }

  return results;
}

/**
 * Run tests in parallel (batched)
 */
async function runParallel(
  queries: Array<{ category: string; query: string }>
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (let i = 0; i < queries.length; i += MAX_CONCURRENT) {
    const batch = queries.slice(i, i + MAX_CONCURRENT);
    console.log(
      `\n📦 Running batch ${Math.floor(i / MAX_CONCURRENT) + 1} (${batch.length} queries)...`
    );

    const batchPromises = batch.map((q, idx) =>
      runTest(q.category, q.query, i + idx, queries.length)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Write incrementally after each batch
    writeIncrementalResults(results, false);
  }

  return results;
}

/**
 * Generate markdown output
 */
function generateOutput(results: TestResult[]): string {
  const timestamp = new Date().toISOString();
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;

  let output = `# Query Test Results\n\n`;
  output += `**Generated:** ${timestamp}\n`;
  output += `**Mode:** ${PARALLEL ? "Parallel" : "Sequential"}\n`;
  output += `**Total Queries:** ${results.length}\n`;
  output += `**Success:** ${successCount} | **Failed:** ${failCount}\n`;
  output += `**Total Duration:** ${(totalDuration / 1000).toFixed(2)}s\n\n`;
  output += `---\n\n`;

  // Group by category
  const byCategory = new Map<string, TestResult[]>();
  for (const result of results) {
    if (!byCategory.has(result.category)) {
      byCategory.set(result.category, []);
    }
    byCategory.get(result.category)!.push(result);
  }

  // Output each category
  for (const [category, categoryResults] of byCategory) {
    output += `## ${category}\n\n`;

    for (const result of categoryResults) {
      output += `### Query: "${result.query}"\n\n`;

      if (result.error) {
        output += `❌ **Error:** ${result.error}\n\n`;
      } else {
        output += `**Duration:** ${result.duration}ms\n\n`;
        output += `**Response:**\n\n`;
        output += `${result.response}\n\n`;
      }

      output += `---\n\n`;
    }
  }

  return output;
}

/**
 * Fetch Jordan's user ID from database
 */
async function fetchTestUserId(): Promise<string | null> {
  if (!DATABASE_URL) {
    console.warn("⚠️  No DATABASE_URL - skipping user ID fetch");
    return null;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    const result = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [
      "jordan@lorikeet.ai",
    ]);

    if (result.rows.length > 0) {
      console.log(`✅ Found user: jordan@lorikeet.ai (${result.rows[0].id})\n`);
      return result.rows[0].id;
    } else {
      console.warn("⚠️  User jordan@lorikeet.ai not found in database\n");
      return null;
    }
  } catch (error) {
    console.error("❌ Failed to fetch user ID:", error);
    return null;
  } finally {
    await client.end();
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🧪 Query Test Runner\n");
  console.log(`Mode: ${PARALLEL ? "Parallel" : "Sequential"}`);
  console.log(`API URL: ${API_URL}\n`);

  // Fetch Jordan's user ID from database
  TEST_USER_ID = await fetchTestUserId();

  // Use hardcoded queries
  const queries = ALL_QUERIES;
  console.log(`📋 Found ${queries.length} queries\n`);

  // Run tests
  const startTime = Date.now();
  const results = PARALLEL ? await runParallel(queries) : await runSequential(queries);
  const totalTime = Date.now() - startTime;

  // Final write with completion flag
  writeIncrementalResults(results, true);

  // Summary
  console.log(`\n✅ Test run complete!`);
  console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Results written to: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
