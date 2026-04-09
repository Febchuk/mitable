#!/usr/bin/env tsx
/**
 * Backfill Encrypted Tokens Script
 *
 * Migrates existing plaintext access tokens to encrypted format.
 * Uses AES-256-GCM encryption via encryption.service.ts
 *
 * Usage:
 *   npm run backfill-tokens
 *
 * Safety features:
 * - Batch processing (prevents memory issues)
 * - Dry-run mode (preview without changes)
 * - Progress tracking
 * - Error handling per record
 * - Verification after encryption
 *
 * Prerequisites:
 * 1. Migration 0008 has been run (encrypted columns exist)
 * 2. ENCRYPTION_KEY environment variable is set
 * 3. Database credentials are configured
 */

import { db } from "../db/client.js";
import { integrations } from "../domains/integrations/schema/integrations.schema.js";
import { isNotNull, eq } from "drizzle-orm";
import { encryptionService } from "../domains/auth/services/encryption.service.js";
import { validateConfig } from "../config.js";

const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes("--dry-run");

interface BackfillStats {
  total: number;
  encrypted: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ id: string; provider: string; error: string }>;
}

async function main() {
  console.log("\n🔐 Starting Token Encryption Backfill\n");

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN MODE - No changes will be made\n");
  }

  // Validate environment
  try {
    validateConfig();
    if (!encryptionService.isConfigured()) {
      throw new Error("Encryption service not configured");
    }
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const stats: BackfillStats = {
    total: 0,
    encrypted: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    // Count total records to encrypt
    const [countResult] = await db
      .select({ count: integrations.id })
      .from(integrations)
      .where(isNotNull(integrations.accessToken));

    console.log(`📊 Found ${countResult ? "records" : "0 records"} to process\n`);

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch batch of unencrypted records
      const batch = await db
        .select()
        .from(integrations)
        .where(isNotNull(integrations.accessToken))
        .limit(BATCH_SIZE)
        .offset(offset);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`\n📦 Processing batch ${offset / BATCH_SIZE + 1} (${batch.length} records)...`);

      // Process each record in batch
      for (const record of batch) {
        stats.total++;

        try {
          // Skip if already encrypted
          if (record.accessTokenEncrypted) {
            console.log(`  ⏭️  [${record.provider}] Already encrypted, skipping`);
            stats.skipped++;
            continue;
          }

          // Skip if no access token (shouldn't happen but safety check)
          if (!record.accessToken) {
            console.log(`  ⏭️  [${record.provider}] No access token, skipping`);
            stats.skipped++;
            continue;
          }

          if (DRY_RUN) {
            console.log(
              `  🔍 [${record.provider}] Would encrypt token (length: ${record.accessToken.length})`
            );
            stats.encrypted++;
            continue;
          }

          // Encrypt tokens
          const encryptedAccessToken = encryptionService.encrypt(record.accessToken);
          const encryptedRefreshToken = record.refreshToken
            ? encryptionService.encrypt(record.refreshToken)
            : null;

          // Update record with encrypted tokens
          await db
            .update(integrations)
            .set({
              accessTokenEncrypted: encryptedAccessToken,
              refreshTokenEncrypted: encryptedRefreshToken,
              encryptionVersion: 1,
              updatedAt: new Date(),
            })
            .where(eq(integrations.id, record.id));

          // Verify encryption worked
          const decrypted = encryptionService.decrypt(encryptedAccessToken);
          if (decrypted !== record.accessToken) {
            throw new Error("Decryption verification failed - encrypted data is corrupted");
          }

          console.log(`  ✅ [${record.provider}] Encrypted successfully`);
          stats.encrypted++;
        } catch (error) {
          console.error(
            `  ❌ [${record.provider}] Failed:`,
            error instanceof Error ? error.message : error
          );
          stats.errors++;
          stats.errorDetails.push({
            id: record.id,
            provider: record.provider,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      offset += BATCH_SIZE;
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 BACKFILL SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total records processed: ${stats.total}`);
    console.log(`✅ Successfully encrypted: ${stats.encrypted}`);
    console.log(`⏭️  Skipped (already encrypted): ${stats.skipped}`);
    console.log(`❌ Errors: ${stats.errors}`);

    if (stats.errorDetails.length > 0) {
      console.log("\n❌ Error Details:");
      stats.errorDetails.forEach(({ id, provider, error }) => {
        console.log(`  - ${provider} (${id}): ${error}`);
      });
    }

    if (DRY_RUN) {
      console.log("\n⚠️  DRY RUN COMPLETE - No changes were made");
      console.log("   Run without --dry-run to perform actual encryption");
    } else if (stats.errors === 0) {
      console.log("\n✅ BACKFILL COMPLETE - All tokens encrypted successfully!");
      console.log("\n📋 Next steps:");
      console.log("   1. Verify encrypted tokens work in production");
      console.log("   2. Monitor for 24-48 hours");
      console.log("   3. Run migration 0009 to drop plaintext columns");
    } else {
      console.log("\n⚠️  BACKFILL COMPLETED WITH ERRORS");
      console.log("   Fix errors and re-run script");
    }

    console.log("=".repeat(60) + "\n");

    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
