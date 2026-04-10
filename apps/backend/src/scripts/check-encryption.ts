#!/usr/bin/env tsx
/**
 * Quick script to verify token encryption is working
 */

import { db } from "../db/client.js";
import { integrations } from "../domains/integrations/schema/integrations.schema.js";

async function main() {
  console.log("\n🔍 Checking token encryption status...\n");

  const allIntegrations = await db.select().from(integrations);

  if (allIntegrations.length === 0) {
    console.log("📭 No integrations found\n");
    process.exit(0);
  }

  console.log(`📊 Found ${allIntegrations.length} integration(s)\n`);

  for (const integration of allIntegrations) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📦 Provider: ${integration.provider}`);
    console.log(`🆔 Organization: ${integration.organizationId}`);
    console.log(`📅 Created: ${integration.createdAt}`);
    console.log("");

    // Check access token encryption
    if (integration.accessTokenEncrypted) {
      console.log(`✅ Access token: ENCRYPTED`);
      console.log(`   Format: ${integration.accessTokenEncrypted.substring(0, 20)}...`);
      console.log(`   Length: ${integration.accessTokenEncrypted.length} chars`);
      console.log(`   Version: ${integration.encryptionVersion}`);
    } else if (integration.accessToken) {
      console.log(`⚠️  Access token: PLAINTEXT ONLY`);
      console.log(`   Length: ${integration.accessToken.length} chars`);
    } else {
      console.log(`❌ Access token: MISSING`);
    }

    // Check refresh token encryption (Notion only)
    if (integration.provider === "notion") {
      if (integration.refreshTokenEncrypted) {
        console.log(`✅ Refresh token: ENCRYPTED`);
        console.log(`   Format: ${integration.refreshTokenEncrypted.substring(0, 20)}...`);
        console.log(`   Length: ${integration.refreshTokenEncrypted.length} chars`);
      } else if (integration.refreshToken) {
        console.log(`⚠️  Refresh token: PLAINTEXT ONLY`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}\n`);

  const encrypted = allIntegrations.filter((i) => i.accessTokenEncrypted).length;
  const plaintext = allIntegrations.filter((i) => !i.accessTokenEncrypted && i.accessToken).length;

  console.log(`📊 Summary:`);
  console.log(`   ✅ Encrypted: ${encrypted}`);
  console.log(`   ⚠️  Plaintext only: ${plaintext}`);
  console.log("");

  if (encrypted > 0) {
    console.log("🎉 Token encryption is working!\n");
  } else {
    console.log("⚠️  No encrypted tokens found. Run backfill script.\n");
  }

  process.exit(0);
}

main();
