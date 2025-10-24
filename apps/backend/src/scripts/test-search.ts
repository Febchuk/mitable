#!/usr/bin/env tsx
/**
 * Test Search Service
 * Tests hybrid search with real data
 */

import { searchService } from "../services/search.service.js";
import { vectorService } from "../services/vector.service.js";
import { validateConfig } from "../config.js";

async function main() {
  // Validate config
  try {
    validateConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Get command line args
  const organizationId = process.argv[2];
  const query = process.argv.slice(3).join(" ");

  if (!organizationId || !query) {
    console.error("❌ Usage: npm run test-search <organizationId> <query>");
    console.error("Example: npm run test-search abc-123 how to deploy");
    process.exit(1);
  }

  console.log("\n🔍 Testing Hybrid Search");
  console.log("=".repeat(60));
  console.log(`Organization: ${organizationId}`);
  console.log(`Query: "${query}"`);
  console.log("=".repeat(60));

  // Initialize
  vectorService.initialize();

  try {
    // Perform search
    console.log("\n⚡ Searching...\n");
    const results = await searchService.search({
      query,
      organizationId,
      topK: 5,
    });

    // Display results
    console.log("=".repeat(60));
    console.log("📊 Search Results");
    console.log("=".repeat(60));
    console.log(`Total results: ${results.totalResults}`);
    console.log(`Semantic results: ${results.semanticResults}`);
    console.log(`Keyword results: ${results.keywordResults}`);
    console.log(`Search time: ${results.searchTime}ms`);
    console.log("=".repeat(60));

    if (results.results.length === 0) {
      console.log("\n❌ No results found");
      process.exit(0);
    }

    // Display top results
    results.results.forEach((result, i) => {
      console.log(`\n📄 Result ${i + 1}:`);
      console.log(`   Score: ${result.score.toFixed(4)} (semantic: ${result.semanticScore?.toFixed(4) || "N/A"}, keyword: ${result.keywordScore?.toFixed(4) || "N/A"})`);
      console.log(`   Source: ${result.source} (${result.sourceType || "N/A"})`);
      
      if (result.channelName) {
        console.log(`   Channel: #${result.channelName}`);
      }
      if (result.username) {
        console.log(`   Author: ${result.username}`);
      }
      if (result.pageTitle) {
        console.log(`   Page: ${result.pageTitle}`);
      }
      if (result.date) {
        console.log(`   Date: ${result.date}`);
      }
      
      console.log(`   Snippet: ${result.snippet || result.text.substring(0, 150) + "..."}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ Search test complete!");
    console.log("=".repeat(60) + "\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Search failed:");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause) {
      console.error("Caused by:", error.cause);
    }
    process.exit(1);
  }
}

main();
