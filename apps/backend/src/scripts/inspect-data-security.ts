/**
 * Inspect database and Pinecone for security issues
 *
 * Checks:
 * - Which columns exist in integrations table (plaintext vs encrypted)
 * - Sample data from each table with sensitive fields
 * - What's actually stored (plaintext vs encrypted format)
 * - Pinecone vectors for any leaked sensitive data
 *
 * Run with: npm run inspect-security
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { sql, eq } from "drizzle-orm";
import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "../config.js";

async function main() {
  console.log("\n🔍 SECURITY INSPECTION REPORT\n");
  console.log("=".repeat(80));

  // ============================================================================
  // 1. CHECK INTEGRATIONS TABLE SCHEMA
  // ============================================================================
  console.log("\n📊 1. INTEGRATIONS TABLE SCHEMA\n");

  try {
    const schemaInfo = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'integrations'
      AND column_name IN (
        'access_token', 
        'refresh_token', 
        'access_token_encrypted', 
        'refresh_token_encrypted',
        'metadata'
      )
      ORDER BY column_name;
    `);

    console.log("Columns found:");
    if (schemaInfo.rows.length === 0) {
      console.log("  ⚠️  No sensitive columns found (unexpected!)");
    } else {
      schemaInfo.rows.forEach((row: any) => {
        const icon = row.column_name.includes("encrypted") ? "🔒" : "⚠️";
        console.log(
          `  ${icon} ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`
        );
      });
    }

    // Check if plaintext columns exist
    const hasPlaintext = schemaInfo.rows.some(
      (row: any) => row.column_name === "access_token" || row.column_name === "refresh_token"
    );

    if (hasPlaintext) {
      console.log("\n  🔴 SECURITY ISSUE: Plaintext token columns still exist!");
      console.log("     These should have been dropped by migration 0009");
    } else {
      console.log("\n  ✅ Good: Plaintext columns have been removed");
    }
  } catch (error) {
    console.error("  ❌ Error checking schema:", error);
  }

  // ============================================================================
  // 2. SAMPLE INTEGRATION DATA
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("\n📋 2. SAMPLE INTEGRATION DATA (First Row)\n");

  try {
    const integrations = await db.select().from(schema.integrations).limit(1);

    if (integrations.length === 0) {
      console.log("  No integrations found in database");
    } else {
      const integration = integrations[0] as any;
      console.log("Integration ID:", integration.id);
      console.log("Provider:", integration.provider);
      console.log("Status:", integration.status);
      console.log("\nToken Fields:");

      // Check plaintext (should not exist)
      if ("accessToken" in integration || "access_token" in integration) {
        console.log(
          "  🔴 access_token (PLAINTEXT):",
          integration.accessToken || integration.access_token
        );
      } else {
        console.log("  ✅ access_token: Column doesn't exist (good!)");
      }

      if ("refreshToken" in integration || "refresh_token" in integration) {
        console.log(
          "  🔴 refresh_token (PLAINTEXT):",
          integration.refreshToken || integration.refresh_token
        );
      } else {
        console.log("  ✅ refresh_token: Column doesn't exist (good!)");
      }

      // Check encrypted (should exist)
      if (integration.accessTokenEncrypted) {
        const preview = integration.accessTokenEncrypted.substring(0, 50);
        const isEncrypted = preview.includes(":") && preview.split(":").length === 3;
        console.log(`  ${isEncrypted ? "🔒" : "⚠️"} access_token_encrypted: ${preview}...`);
        if (isEncrypted) {
          console.log("     Format: IV:authTag:ciphertext (correct!)");
        } else {
          console.log("     ⚠️  Format doesn't match expected IV:authTag:ciphertext");
        }
      } else {
        console.log("  ⚠️  access_token_encrypted: NULL or missing");
      }

      if (integration.refreshTokenEncrypted) {
        const preview = integration.refreshTokenEncrypted.substring(0, 50);
        const isEncrypted = preview.includes(":") && preview.split(":").length === 3;
        console.log(`  ${isEncrypted ? "🔒" : "⚠️"} refresh_token_encrypted: ${preview}...`);
      } else {
        console.log(
          "  ℹ️  refresh_token_encrypted: NULL (might be Slack, which doesn't use refresh tokens)"
        );
      }

      // Check metadata
      console.log("\nMetadata:");
      if (integration.metadata) {
        const metadata = integration.metadata as any;
        const keys = Object.keys(metadata);
        console.log(`  Keys: ${keys.join(", ")}`);

        // Check for sensitive data in metadata
        const sensitivePatterns = ["token", "secret", "key", "password", "credential"];
        const foundSensitive = keys.filter((k) =>
          sensitivePatterns.some((p) => k.toLowerCase().includes(p))
        );

        if (foundSensitive.length > 0) {
          console.log(`  ⚠️  Potentially sensitive keys in metadata: ${foundSensitive.join(", ")}`);
          foundSensitive.forEach((key) => {
            const value = metadata[key];
            if (typeof value === "string") {
              console.log(`    - ${key}: ${value.substring(0, 20)}...`);
            }
          });
        } else {
          console.log("  ✅ No obvious sensitive keys in metadata");
        }
      }
    }
  } catch (error) {
    console.error("  ❌ Error fetching integration data:", error);
  }

  // ============================================================================
  // 3. CHECK OTHER TABLES
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("\n📋 3. OTHER TABLES WITH POTENTIAL SENSITIVE DATA\n");

  try {
    // Check search_content table
    console.log("search_content table (sample):");
    const searchContent = await db.select().from(schema.searchContent).limit(1);

    if (searchContent.length > 0) {
      const content = searchContent[0];
      console.log(`  ID: ${content.id}`);
      console.log(`  Source: ${content.source}`);
      console.log(`  Text preview: ${content.text.substring(0, 100)}...`);

      // Check for tokens/secrets in text
      const sensitivePatterns = [
        /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/, // Slack bot token
        /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access token
        /sk-[a-zA-Z0-9]{48}/, // OpenAI API key
        /AKIA[0-9A-Z]{16}/, // AWS access key
      ];

      const foundPattern = sensitivePatterns.some((pattern) => pattern.test(content.text));
      if (foundPattern) {
        console.log("  🔴 WARNING: Potential API token/secret found in search_content.text!");
      } else {
        console.log("  ✅ No obvious tokens/secrets in text field");
      }
    } else {
      console.log("  No data in search_content table");
    }

    // Check for Slack data in search_content
    console.log("\nSlack data in search_content (sample):");
    const slackContent = await db
      .select()
      .from(schema.searchContent)
      .where(eq(schema.searchContent.source, "slack"))
      .limit(1);

    if (slackContent.length > 0) {
      const content = slackContent[0];
      console.log(`  ID: ${content.id}`);
      console.log(`  Source type: ${content.sourceType}`);
      console.log(`  Text preview: ${content.text?.substring(0, 100) || "(empty)"}...`);
      console.log("  ✅ User-generated content (not sensitive)");
    } else {
      console.log("  No Slack data in search_content table");
    }

    // Check for Notion data in search_content
    console.log("\nNotion data in search_content (sample):");
    const notionContent = await db
      .select()
      .from(schema.searchContent)
      .where(eq(schema.searchContent.source, "notion"))
      .limit(1);

    if (notionContent.length > 0) {
      const content = notionContent[0];
      console.log(`  ID: ${content.id}`);
      console.log(`  Source type: ${content.sourceType}`);
      console.log(`  Text preview: ${content.text?.substring(0, 100) || "(empty)"}...`);
      console.log("  ✅ User-generated content (not sensitive)");
    } else {
      console.log("  No Notion data in search_content table");
    }
  } catch (error) {
    console.error("  ❌ Error checking other tables:", error);
  }

  // ============================================================================
  // 4. CHECK PINECONE
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("\n🌲 4. PINECONE VECTOR STORE\n");

  try {
    if (!config.pinecone.apiKey) {
      console.log("  ⚠️  Pinecone API key not configured, skipping");
    } else {
      const pinecone = new Pinecone({ apiKey: config.pinecone.apiKey });
      const index = pinecone.index(config.pinecone.indexName);

      // Get index stats
      const stats = await index.describeIndexStats();
      console.log("Index stats:");
      console.log(`  Total vectors: ${stats.totalRecordCount}`);
      console.log(`  Namespaces: ${Object.keys(stats.namespaces || {}).length}`);

      // Sample a few vectors
      console.log("\nSample vectors (first namespace):");
      const firstNamespace = Object.keys(stats.namespaces || {})[0];

      if (firstNamespace) {
        // Query for a few vectors
        const sampleQuery = await index.namespace(firstNamespace).query({
          vector: new Array(1536).fill(0), // Dummy vector
          topK: 3,
          includeMetadata: true,
        });

        if (sampleQuery.matches && sampleQuery.matches.length > 0) {
          sampleQuery.matches.forEach((match, i) => {
            console.log(`\n  Vector ${i + 1}:`);
            console.log(`    ID: ${match.id}`);
            if (match.metadata) {
              console.log(`    Metadata keys: ${Object.keys(match.metadata).join(", ")}`);

              // Check for sensitive data in metadata
              const sensitiveKeys = ["token", "secret", "key", "password", "api_key"];
              const foundSensitive = Object.keys(match.metadata).filter((k) =>
                sensitiveKeys.some((sk) => k.toLowerCase().includes(sk))
              );

              if (foundSensitive.length > 0) {
                console.log(
                  `    🔴 WARNING: Sensitive keys in Pinecone metadata: ${foundSensitive.join(", ")}`
                );
              } else {
                console.log(`    ✅ No sensitive keys in metadata`);
              }
            }
          });
        } else {
          console.log("  No vectors found in namespace");
        }
      } else {
        console.log("  No namespaces found");
      }
    }
  } catch (error) {
    console.error("  ❌ Error checking Pinecone:", error);
  }

  // ============================================================================
  // 5. SUMMARY
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("\n📝 SUMMARY\n");
  console.log("Check the report above for:");
  console.log("  1. ⚠️  Plaintext token columns still in database");
  console.log("  2. 🔒 Encrypted token format (should be IV:authTag:ciphertext)");
  console.log("  3. 🔴 Sensitive data in metadata, search_content, or Pinecone");
  console.log("\nIf issues found, take appropriate action to encrypt/remove sensitive data.");
  console.log("\n" + "=".repeat(80) + "\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});
