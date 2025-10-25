#!/usr/bin/env tsx
/**
 * Verify Dual-Write Script
 * Quick check that both Pinecone and PostgreSQL have matching data
 */

import { vectorService } from "../services/vector.service.js";
import { db } from "../db/client.js";
import { searchContent } from "../db/schema/index.js";
import { sql } from "drizzle-orm";

async function main() {
  console.log("\n🔍 Verifying Dual-Write Implementation");
  console.log("=".repeat(60));

  // Initialize vector service
  vectorService.initialize();

  // Check Pinecone
  console.log("\n📊 Pinecone Stats:");
  const pineconeStats = await vectorService.getStats();
  console.log(`Total vectors: ${pineconeStats.totalRecordCount || 0}`);

  if (pineconeStats.namespaces) {
    for (const [namespace, stats] of Object.entries(pineconeStats.namespaces)) {
      console.log(`  Namespace "${namespace}": ${(stats as any).recordCount || 0} vectors`);
    }
  }

  // Check PostgreSQL
  console.log("\n📊 PostgreSQL Stats:");
  const pgTotal = await db.select({ count: sql<number>`count(*)` }).from(searchContent);
  console.log(`Total records: ${pgTotal[0].count}`);

  // Breakdown by source
  const bySource = await db
    .select({
      source: searchContent.source,
      count: sql<number>`count(*)`,
    })
    .from(searchContent)
    .groupBy(searchContent.source);

  console.log("\nBreakdown by source:");
  bySource.forEach((row) => {
    console.log(`  ${row.source}: ${row.count} records`);
  });

  // Sample records from PostgreSQL (ordered by date DESC to see most recent)
  const samples = await db
    .select({
      id: searchContent.id,
      source: searchContent.source,
      sourceType: searchContent.sourceType,
      text: searchContent.text,
      date: searchContent.date,
      timestamp: searchContent.timestamp,
      channelName: searchContent.channelName,
      username: searchContent.username,
      hasTextVector: sql<boolean>`${searchContent.textVector} IS NOT NULL`,
      chunkIndex: searchContent.chunkIndex,
      totalChunks: searchContent.totalChunks,
    })
    .from(searchContent)
    .orderBy(sql`${searchContent.date} DESC, ${searchContent.timestamp} DESC`)
    .limit(5);

  console.log("\n📅 Most Recent Messages (sorted by date):");
  samples.forEach((record, i) => {
    console.log(`\n  Sample ${i + 1}:`);
    console.log(`    📅 Date: ${record.date || "N/A"}`);
    if (record.timestamp) {
      const msgDate = new Date(record.timestamp * 1000);
      console.log(`    🕐 Timestamp: ${msgDate.toLocaleString()}`);
    }
    console.log(`    ID: ${record.id}`);
    console.log(`    Source: ${record.source} (${record.sourceType})`);
    if (record.channelName) {
      console.log(`    Channel: #${record.channelName}`);
    }
    if (record.username) {
      console.log(`    User: ${record.username}`);
    }
    console.log(`    Text: ${record.text.substring(0, 80)}...`);
    console.log(`    Text Vector: ${record.hasTextVector ? "✅ Generated" : "❌ Missing"}`);
    console.log(`    Chunks: ${(record.chunkIndex || 0) + 1}/${record.totalChunks || 1}`);
  });

  // Verification
  console.log("\n" + "=".repeat(60));
  console.log("✅ Dual-Write Verification:");
  const pineconeTotal = pineconeStats.totalRecordCount || 0;
  const postgresTotal = Number(pgTotal[0].count);

  if (pineconeTotal === postgresTotal) {
    console.log(`✅ SUCCESS: Both systems match with ${pineconeTotal} records!`);
  } else {
    console.log(`⚠️  Mismatch detected:`);
    console.log(`   Pinecone: ${pineconeTotal}`);
    console.log(`   PostgreSQL: ${postgresTotal}`);
    console.log(`   Difference: ${Math.abs(pineconeTotal - postgresTotal)}`);
  }
  console.log("=".repeat(60) + "\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
