# 🔐 Token Encryption Implementation Guide

## Overview

This guide covers the token encryption feature that securely stores Slack and Notion OAuth access tokens using **AES-256-GCM** authenticated encryption.

---

## 🎯 What Was Implemented

### Security Features
- ✅ **AES-256-GCM** authenticated encryption (NIST-recommended)
- ✅ **Random 12-byte IV** per encryption (prevents pattern analysis)
- ✅ **16-byte authentication tag** (prevents tampering)
- ✅ **Zero-downtime migration** (dual-write during transition)
- ✅ **Automatic token refresh encryption** (Notion tokens)
- ✅ **Encryption versioning** (for future algorithm upgrades)
- ✅ **Comprehensive test suite** (>90% coverage)

### Files Created
```
apps/backend/src/
├── services/
│   ├── encryption.service.ts          # Core encryption logic
│   └── encryption.service.test.ts     # Unit tests
├── scripts/
│   ├── backfill-encrypted-tokens.ts   # Migration script
│   └── run-migration-0008.ts          # DB migration runner
└── db/
    └── migrations/
        ├── 0008_add_encrypted_tokens.sql      # Add encrypted columns
        └── 0009_remove_plaintext_tokens.sql   # Drop plaintext columns (future)
```

### Files Modified
```
apps/backend/src/
├── db/schema/integrations.schema.ts   # Added encrypted columns
├── routes/integrations.ts             # Encrypt on OAuth callback
├── services/
│   ├── slack.service.ts               # Decrypt before API calls
│   └── notion.service.ts              # Decrypt before API calls
├── .env                               # Added ENCRYPTION_KEY
└── .env.example                       # Documented ENCRYPTION_KEY
```

---

## 🚀 How to Test

### 1. Connect a New Slack Workspace

**Steps:**
1. Start the backend server:
   ```bash
   cd apps/backend
   npm run dev
   ```

2. In your frontend app, navigate to integrations
3. Click **"Connect Slack"**
4. Authorize the workspace
5. Check the logs - you should see:
   ```
   ✅ Slack connected for organization: <org-id> (<workspace-name>)
   ```

**What Happens:**
- OAuth callback receives the access token
- Token is **encrypted** using AES-256-GCM
- Token is stored in **both** columns:
  - `access_token` (plaintext - temporary, will be removed)
  - `access_token_encrypted` (encrypted - primary)

### 2. Connect a New Notion Workspace

**Steps:**
1. In your frontend app, navigate to integrations
2. Click **"Connect Notion"**
3. Authorize the workspace
4. Check the logs - you should see:
   ```
   ✅ Notion connected for organization: <org-id> (<workspace-name>)
   ```

**What Happens:**
- OAuth callback receives access + refresh tokens
- Both tokens are **encrypted** using AES-256-GCM
- Tokens are stored in **both** columns:
  - `access_token`, `refresh_token` (plaintext - temporary)
  - `access_token_encrypted`, `refresh_token_encrypted` (encrypted - primary)

### 3. Test Slack Message Fetch

**Steps:**
1. After connecting Slack, try fetching messages:
   ```bash
   npm run sync-slack
   ```

2. Check the logs - you should see:
   ```
   🔍 Finding Slack integration...
   📥 Fetching messages...
   ✅ Processed X messages
   ```

**What Happens:**
- `slack.service.ts` reads from database
- If `access_token_encrypted` exists, it **decrypts** it
- Uses decrypted token to call Slack API
- If decryption fails, you'll see an error

### 4. Test Notion Page Sync

**Steps:**
1. After connecting Notion, try syncing pages:
   ```bash
   npm run sync-notion
   ```

2. Check the logs - you should see:
   ```
   🔍 Finding Notion integration...
   📥 Fetching pages...
   ✅ Processed X pages
   ```

**What Happens:**
- `notion.service.ts` reads from database
- If `access_token_encrypted` exists, it **decrypts** it
- Uses decrypted token to call Notion API
- If token is expired, it refreshes and **re-encrypts** the new token

---

## 🔍 How to Verify It's Working

### Check Database Columns

**Option 1: Using Drizzle Studio**
```bash
npm run db:studio
```
Navigate to the `integrations` table and look for:
- `access_token_encrypted` - Should contain encrypted string like `abc123:def456:ghi789`
- `refresh_token_encrypted` - Should contain encrypted string (Notion only)
- `encryption_version` - Should be `1`

**Option 2: Using SQL Query**
```sql
SELECT 
  provider,
  status,
  CASE 
    WHEN access_token_encrypted IS NOT NULL THEN '✅ Encrypted'
    ELSE '❌ Plaintext only'
  END as token_status,
  encryption_version,
  created_at
FROM integrations;
```

### Check Application Logs

**During OAuth Connection:**
```
✅ Slack connected for organization: <org-id> (<workspace>)
✅ Notion connected for organization: <org-id> (<workspace>)
```

**During API Calls (if using plaintext fallback):**
```
⚠️ [SlackService] Using plaintext token for org <org-id> - run backfill script
⚠️ [NotionService] Using plaintext tokens for org <org-id> - run backfill script
```

**Good sign:** No warnings = encrypted tokens are being used! ✅

---

## 🔄 Migrating Existing Integrations

If you already have Slack/Notion integrations connected **before** this feature was deployed, run the backfill script:

### Step 1: Preview (Dry Run)
```bash
npm run backfill-tokens -- --dry-run
```

**Expected Output:**
```
📊 Found 2 records to process

📦 Processing batch 1 (2 records)...
  🔍 [slack] Would encrypt token (length: 55)
  🔍 [notion] Would encrypt token (length: 48)

✅ Successfully encrypted: 2
⏭️  Skipped (already encrypted): 0
❌ Errors: 0
```

### Step 2: Actual Migration
```bash
npm run backfill-tokens
```

**Expected Output:**
```
📦 Processing batch 1 (2 records)...
  ✅ [slack] Encrypted successfully
  ✅ [notion] Encrypted successfully

✅ BACKFILL COMPLETE - All tokens encrypted successfully!
```

### Step 3: Verify
Check database or run sync scripts to confirm tokens work:
```bash
npm run sync-slack
npm run sync-notion
```

---

## 🧪 Running Tests

### Unit Tests
```bash
cd apps/backend
npm run test -- encryption.service.test.ts
```

**Expected Output:**
```
 PASS  src/services/encryption.service.test.ts
  EncryptionService
    ✓ Configuration
    ✓ Encryption/Decryption
    ✓ Security Features
    ✓ Error Handling
    ✓ Performance

Test Suites: 1 passed, 1 total
Tests:       10+ passed, 10+ total
```

---

## 🐛 Troubleshooting

### Issue: "ENCRYPTION_KEY environment variable not set"

**Cause:** Missing encryption key in `.env`

**Fix:**
```bash
# Generate a new key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
echo 'ENCRYPTION_KEY=<your-key-here>' >> apps/backend/.env
```

### Issue: "Failed to decrypt token - invalid format"

**Cause:** Encrypted data is corrupted or wrong key

**Possible Solutions:**
1. Check that `ENCRYPTION_KEY` matches the one used to encrypt
2. Re-run OAuth flow to get fresh encrypted token
3. Check database - encrypted format should be `iv:authTag:ciphertext`

### Issue: Slack/Notion API calls fail with "invalid_auth"

**Cause:** Token decryption might be failing silently

**Debug Steps:**
1. Check application logs for decryption errors
2. Verify `access_token_encrypted` exists in database
3. Try re-connecting the integration
4. Check if plaintext fallback warning appears

### Issue: Migration script finds 0 records

**Cause:** No existing integrations in database

**Solution:** Nothing to worry about! Connect a new integration and it will automatically be encrypted.

---

## 📊 Architecture

### Encryption Flow (OAuth Callback)
```
OAuth Provider
    ↓ (returns access_token)
Mitable Backend (routes/integrations.ts)
    ↓ encryptionService.encrypt(token)
Database (dual-write)
    ├── access_token (plaintext) ← DEPRECATED
    └── access_token_encrypted ← PRIMARY
```

### Decryption Flow (API Calls)
```
Database
    ↓ (read integration record)
Service (slack.service.ts / notion.service.ts)
    ↓ encryptionService.decrypt(access_token_encrypted)
External API (Slack/Notion)
    ↓ (use decrypted token)
Response
```

### Token Refresh Flow (Notion Only)
```
Notion API (token expired)
    ↓
notion.service.ts (refreshAccessToken)
    ↓ (receives new tokens)
encryptionService.encrypt(new_token)
    ↓
Database (dual-write with new encrypted tokens)
```

---

## 🔒 Security Best Practices

### ✅ DO
- ✅ Keep `ENCRYPTION_KEY` in environment variables only
- ✅ Use different keys for dev/staging/production
- ✅ Rotate keys annually or if compromised
- ✅ Monitor logs for decryption failures
- ✅ Run backfill script after deploying encryption
- ✅ Keep `.env` in `.gitignore`

### ❌ DON'T
- ❌ Commit `ENCRYPTION_KEY` to git
- ❌ Share keys via Slack/email
- ❌ Reuse keys across projects
- ❌ Use short or weak keys
- ❌ Skip the backfill script (if you have existing integrations)
- ❌ Drop plaintext columns before verification

---

## 📅 Deployment Checklist

### Phase 1: Prepare ✅
- [x] Generate `ENCRYPTION_KEY`
- [x] Add to local `.env`
- [x] Run unit tests
- [x] Run migration 0008

### Phase 2: Deploy 🔄
- [ ] Add `ENCRYPTION_KEY` to Railway/Production environment variables
- [ ] Deploy code to production
- [ ] Monitor logs for errors

### Phase 3: Backfill ⏳
- [ ] Run backfill script (if you have existing integrations)
- [ ] Verify all tokens encrypted
- [ ] Test OAuth flows (connect new workspace)
- [ ] Test API calls (sync messages/pages)

### Phase 4: Verify ⏳
- [ ] Wait 24-48 hours
- [ ] Monitor for any issues
- [ ] Confirm no plaintext token warnings in logs

### Phase 5: Cleanup (Future) 🔜
- [ ] Run migration 0009 to drop plaintext columns
- [ ] Update schema to remove deprecated fields
- [ ] Remove dual-write logic from routes

---

## 🎓 How It Works (Technical Details)

### AES-256-GCM Overview
- **Algorithm:** Advanced Encryption Standard with 256-bit key
- **Mode:** Galois/Counter Mode (GCM) - authenticated encryption
- **IV:** 12 bytes (96 bits) - randomly generated per encryption
- **Auth Tag:** 16 bytes (128 bits) - prevents tampering
- **Key:** 32 bytes (256 bits) - from `ENCRYPTION_KEY` environment variable

### Encrypted Format
```
iv:authTag:ciphertext
```
Example:
```
a1b2c3d4e5f6g7h8i9j0:k1l2m3n4o5p6q7r8:s9t0u1v2w3x4y5z6...
```

### Why GCM?
- **Authenticated:** Detects tampering (integrity check)
- **Fast:** Hardware acceleration available
- **Secure:** NIST-recommended for sensitive data
- **Modern:** Used by TLS 1.3, VPN protocols

### Encryption Versioning
The `encryption_version` column allows for future algorithm upgrades:
- **Version 1:** AES-256-GCM (current)
- **Version 2+:** Future algorithms (e.g., ChaCha20-Poly1305)

This enables gradual migration to new algorithms without breaking existing data.

---

## 📚 References

- [NIST GCM Recommendation](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

## 💡 Tips

### For Development
- Use a test encryption key locally (don't use production key)
- Test OAuth flows regularly to ensure encryption works
- Check logs for any decryption warnings

### For Production
- Generate a strong key: `openssl rand -hex 32`
- Store in Railway/Vercel environment variables
- Never log decrypted tokens
- Rotate keys annually

### For Testing
- Use the dry-run flag first: `--dry-run`
- Monitor application logs during backfill
- Test both Slack and Notion integrations after migration

---

## ❓ FAQ

**Q: What happens if I lose the ENCRYPTION_KEY?**  
A: All encrypted tokens become unrecoverable. You'll need to re-authorize all integrations (users click "Connect Slack/Notion" again).

**Q: Can I change the encryption algorithm?**  
A: Yes! Increment `encryption_version` and add new algorithm logic. Old tokens will continue working until re-encrypted.

**Q: Do I need to backfill immediately after deploying?**  
A: Not immediately. The app falls back to plaintext tokens during migration. But backfill soon to ensure full encryption.

**Q: How do I test encryption locally?**  
A: Connect a Slack/Notion workspace locally, then check the database. The `access_token_encrypted` column should have a value.

**Q: Will this break existing integrations?**  
A: No! The dual-write strategy and plaintext fallback ensure zero downtime during migration.

---

**Need help?** Check logs, run tests, or review the troubleshooting section above.

**Ready to deploy?** Follow the deployment checklist step by step.

**Questions?** Refer back to this guide or check the code comments in `encryption.service.ts`.
