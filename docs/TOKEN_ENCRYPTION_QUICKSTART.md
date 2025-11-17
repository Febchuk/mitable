# 🔐 Token Encryption - Quick Reference

## ⚡ Quick Test (5 minutes)

### 1. Start Server
```bash
cd apps/backend
npm run dev
```

### 2. Connect Integration
- Go to your app → Integrations
- Click "Connect Slack" or "Connect Notion"
- Authorize the workspace

### 3. Verify Encryption
**Check logs:**
```
✅ Slack connected for organization: <id> (<name>)
```

**Check database:**
```bash
npm run db:studio
# Look at integrations table
# access_token_encrypted should have a value
```

### 4. Test API Calls
```bash
# Test Slack
npm run sync-slack

# Test Notion
npm run sync-notion
```

**Success:** No errors = encryption working! ✅

---

## 🔄 Migrate Existing Tokens

```bash
# Preview
npm run backfill-tokens -- --dry-run

# Encrypt
npm run backfill-tokens
```

---

## 🐛 Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| "ENCRYPTION_KEY not set" | Add to `.env`: `ENCRYPTION_KEY=<64-char-hex>` |
| Found 0 records | No existing integrations - connect a new one |
| Decryption failed | Check ENCRYPTION_KEY matches, or reconnect integration |
| API calls fail | Check logs for decryption errors, try reconnecting |

---

## 📋 Deployment Checklist

- [ ] `ENCRYPTION_KEY` in production env vars
- [ ] Deploy code
- [ ] Run `npm run backfill-tokens` (if existing integrations)
- [ ] Test OAuth flows
- [ ] Monitor logs for 24-48 hours
- [ ] (Later) Run migration 0009 to drop plaintext columns

---

## 📚 Full Documentation

See [TOKEN_ENCRYPTION_GUIDE.md](./TOKEN_ENCRYPTION_GUIDE.md) for complete details.
