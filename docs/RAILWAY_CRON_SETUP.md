# 🚂 Railway Cron Setup Guide

## Overview

This guide explains how to set up automated syncing of Slack and Notion integrations using Railway's native cron jobs.

---

## 🎯 What Gets Synced

The cron job runs `sync-integrations.ts` which syncs:

- **All Slack integrations** - Incremental message sync
- **All Notion integrations** - Incremental page sync

---

## ⏰ Schedule

- **Frequency:** Every 6 hours
- **Cron Expression:** `0 */6 * * *`
- **Times (UTC):** 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM
- **Execution:** ~5-10 minutes per sync

---

## 💰 Cost Estimate

| Item                 | Details                  |
| -------------------- | ------------------------ |
| **Syncs per day**    | 4                        |
| **Syncs per month**  | 120 (4 × 30)             |
| **Execution time**   | ~10 min per sync         |
| **Total time/month** | ~20 hours (120 × 10 min) |
| **Railway cost**     | ~$6-7/month              |

**Breakdown:**

- Railway Hobby Plan: $5/month (base)
- Execution time: $1-2/month
- **Total:** $6-7/month

---

## 🚀 Setup Instructions

### Step 1: Create New Railway Service

1. Go to your Railway project dashboard
2. Click **"+ New"** → **"Empty Service"**
3. Name it: `mitable-cron-sync`

### Step 2: Connect to GitHub

1. In the service settings, click **"Connect to GitHub"**
2. Select repository: `Febchuk/mitable`
3. Select branch: `main` (or your production branch)
4. Root directory: `apps/backend`

### Step 3: Configure Build Settings

1. **Build Command:**

   ```
   npm install
   ```

2. **Start Command:**

   ```
   npm run sync-integrations
   ```

3. **Watch Paths:**
   ```
   apps/backend/src/scripts/sync-integrations.ts
   apps/backend/src/services/**
   ```

### Step 4: Set Environment Variables

Copy all environment variables from your main backend service:

**Required Variables:**

```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-...

# Pinecone
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=mitable-embeddings

# Slack OAuth
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...

# Notion OAuth
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=...

# Encryption (if using encrypted tokens)
ENCRYPTION_KEY=...

# Node Environment
NODE_ENV=production
```

**Optional Variables:**

```bash
# Groq (if used)
GROQ_API_KEY=...

# Gemini (if used)
GEMINI_API_KEY=...
```

### Step 5: Enable Cron Schedule

1. In the service settings, find **"Cron Schedule"**
2. Enable cron mode
3. Set cron expression: `0 */6 * * *`
4. Save settings

### Step 6: Deploy

1. Click **"Deploy"**
2. Wait for initial deployment to complete
3. Check logs to verify first sync runs successfully

---

## 📊 Monitoring

### View Logs

1. Go to Railway service dashboard
2. Click on `mitable-cron-sync` service
3. Click **"Deployments"** tab
4. Select latest deployment
5. View logs in real-time

### Expected Log Output

```
======================================================================
🚀 RAILWAY CRON - INTEGRATION SYNC
======================================================================
⏰ Started at: 2025-01-16 12:00:00
======================================================================

======================================================================
📢 SLACK SYNC
======================================================================

📋 Found 1 Slack integration(s)

────────────────────────────────────────────────────────
📦 Organization: org-123
🔄 Sync Mode: incremental
📅 Last sync: 1/16/2025, 6:00:00 AM
📊 Channels: 3
────────────────────────────────────────────────────────

📥 Fetching messages from channel-1...
   ✅ 15 messages fetched
📥 Fetching messages from channel-2...
   ✅ 8 messages fetched

✅ Slack sync complete for org-123
   Total messages: 23

============================================================
📊 Slack Summary:
   Integrations: 1
   ✅ Success: 1
   ❌ Failed: 0
   Messages: 23
============================================================

======================================================================
📝 NOTION SYNC
======================================================================

📋 Found 1 Notion integration(s)

────────────────────────────────────────────────────────
📦 Organization: org-123
🔄 Sync Mode: incremental
📅 Last synced: 1/16/2025, 6:00:00 AM
────────────────────────────────────────────────────────

📄 [1/5] Project Planning
📄 [2/5] Meeting Notes
📄 [3/5] Feature Specs

✅ Notion sync complete for org-123
   Pages: 5
   Blocks: 127
   Duration: 12s

============================================================
📊 Notion Summary:
   Integrations: 1
   ✅ Success: 1
   ❌ Failed: 0
   Pages: 5
============================================================

======================================================================
🎉 SYNC COMPLETE
======================================================================
⏰ Finished at: 2025-01-16 12:08:23
⏱️  Duration: 8m 23s

📢 Slack:
   Integrations: 1
   ✅ Success: 1
   ❌ Failed: 0
   Messages: 23

📝 Notion:
   Integrations: 1
   ✅ Success: 1
   ❌ Failed: 0
   Pages: 5
======================================================================
```

---

## 🧪 Testing Locally

Before deploying to Railway, test the combined sync locally:

```bash
cd apps/backend
npm run sync-integrations
```

Expected behavior:

- Syncs all Slack integrations
- Syncs all Notion integrations
- Shows structured logs
- Exits with code 0 on success

---

## 🐛 Troubleshooting

### Issue: Cron job not running

**Possible causes:**

1. Cron schedule not enabled
2. Invalid cron expression
3. Service not deployed

**Solutions:**

1. Check service settings → Enable cron schedule
2. Verify cron expression: `0 */6 * * *`
3. Deploy the service

### Issue: Environment variables missing

**Symptom:**

```
❌ Configuration error: PINECONE_API_KEY not found
```

**Solution:**

1. Go to service settings → Variables
2. Copy all variables from main backend service
3. Redeploy

### Issue: Database connection failed

**Symptom:**

```
❌ Fatal error in Slack sync: Connection terminated
```

**Solution:**

1. Verify `DATABASE_URL` is correct
2. Check if database is accessible from Railway
3. Ensure connection pooler is configured (if using Supabase)

### Issue: No integrations found

**Symptom:**

```
📭 No Slack integrations found
📭 No Notion integrations found
```

**Solution:**

- This is normal if no integrations are connected
- Connect Slack/Notion through the app first
- Run sync again

### Issue: Sync takes too long

**Symptom:**

- Execution time > 15 minutes
- Railway timeout errors

**Solutions:**

1. Reduce `syncFrequency` in database (sync less often)
2. Limit number of Slack channels selected
3. Split into separate Slack/Notion cron jobs

---

## 📝 Cron Expression Reference

| Expression     | Description       | Times (UTC)                          |
| -------------- | ----------------- | ------------------------------------ |
| `0 */6 * * *`  | Every 6 hours     | 12 AM, 6 AM, 12 PM, 6 PM             |
| `0 */4 * * *`  | Every 4 hours     | 12 AM, 4 AM, 8 AM, 12 PM, 4 PM, 8 PM |
| `0 */12 * * *` | Every 12 hours    | 12 AM, 12 PM                         |
| `0 0 * * *`    | Daily at midnight | 12 AM                                |
| `0 */2 * * *`  | Every 2 hours     | Every even hour                      |

**Minimum interval:** 5 minutes (`*/5 * * * *`)

---

## 🔄 Updating the Sync Script

### When code changes:

1. Push changes to your branch
2. Railway auto-deploys on push
3. Next cron run uses updated code

### To change schedule:

1. Go to service settings
2. Update cron expression
3. Save (no deployment needed)

---

## 🎯 Best Practices

### ✅ DO

- ✅ Monitor logs regularly for errors
- ✅ Start with 6-hour intervals
- ✅ Test locally before deploying
- ✅ Keep environment variables synced with main service
- ✅ Use incremental sync for efficiency

### ❌ DON'T

- ❌ Set interval < 1 hour (unnecessary API calls)
- ❌ Ignore failed syncs (check logs)
- ❌ Forget to copy environment variables
- ❌ Run multiple cron services for same data

---

## 📚 References

- [Railway Cron Documentation](https://docs.railway.app/reference/cron-jobs)
- [Cron Expression Generator](https://crontab.guru/)
- [Railway Pricing](https://railway.app/pricing)

---

## 💡 Alternative: Manual Syncs

If you prefer manual control over automated syncs:

**Option 1: API Endpoints**

```bash
# Slack
curl -X POST https://your-api.com/api/integrations/slack/sync

# Notion
curl -X POST https://your-api.com/api/integrations/notion/sync
```

**Option 2: CLI Scripts**

```bash
# Slack only
npm run sync-slack

# Notion only
npm run sync-notion

# Both
npm run sync-integrations
```

**Option 3: GitHub Actions**
Create `.github/workflows/sync-integrations.yml`:

```yaml
name: Sync Integrations
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run sync-integrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          PINECONE_API_KEY: ${{ secrets.PINECONE_API_KEY }}
          # ... other env vars
```

---

**Need help?** Check logs, review troubleshooting section, or test locally first.

**Ready to deploy?** Follow the setup instructions step by step.

**Questions?** Refer back to this guide or check Railway's documentation.
