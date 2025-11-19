# Railway Deployment Guide - Separate Cron Service

This guide explains how to deploy the Mitable project on Railway with a **separate cron service** to avoid downtime.

## Architecture

### Two Services in One Monorepo

1. **Service A: `mitable-backend`** (Main API)
   - Root: `apps/backend`
   - Type: Web server (always running)
   - Port: 3000 (or Railway-assigned)
   - Serves API endpoints for the app

2. **Service B: `mitable-integration-sync`** (Cron Job)
   - Root: `apps/integration-sync`
   - Type: Cron job (runs every 6 hours, then exits)
   - Schedule: `0 */6 * * *`
   - Syncs Slack + Notion integrations

---

## Why Separate Services?

Railway cron jobs **require services to terminate** after completion. If the backend ran as a cron, it would shut down your API during sync operations, causing downtime for users.

By separating the services:
- ✅ Backend stays up 24/7
- ✅ Cron runs independently every 6 hours
- ✅ No downtime
- ✅ Both services share the same codebase

---

## Deployment Steps

### Part 1: Deploy Main Backend (Service A)

If you haven't already deployed your backend:

1. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select `Febchuk/mitable`

2. **Configure Backend Service**
   - Name: `mitable-backend`
   - Root Directory: `apps/backend`
   - Start Command: `npm run start` (auto-detected)
   - **Do NOT enable cron schedule**

3. **Set Environment Variables** (see full list below)

4. **Deploy**

### Part 2: Deploy Cron Service (Service B)

1. **Add New Service to Existing Project**
   - In your Railway project dashboard
   - Click "**+ New**" → "**Empty Service**"
   - Name: `mitable-integration-sync`

2. **Connect to GitHub**
   - Click "**Connect to GitHub**"
   - Repository: `Febchuk/mitable`
   - Branch: `main` (or your production branch)

3. **Service Settings**

   Navigate to **Settings** tab:

   **Root Directory:**
   ```
   apps/integration-sync
   ```

   **Build Command:** (auto-detected)
   ```
   npm install
   ```

   **Start Command:**
   ```
   npm run start
   ```

   **Cron Schedule:** (enable and set to)
   ```
   0 */6 * * *
   ```

4. **Environment Variables**

   Copy **ALL** environment variables from your main backend service. Required variables:

   ```bash
   # Database (Supabase)
   DATABASE_URL=postgresql://...
   DIRECT_URL=postgresql://...

   # Supabase Auth
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...

   # OpenAI (for embeddings)
   OPENAI_API_KEY=sk-...

   # Pinecone (vector database)
   PINECONE_API_KEY=pcsk_...
   PINECONE_INDEX_NAME=mitable-embeddings

   # Slack OAuth
   SLACK_CLIENT_ID=...
   SLACK_CLIENT_SECRET=...

   # Notion OAuth
   NOTION_CLIENT_ID=...
   NOTION_CLIENT_SECRET=...

   # Encryption (CRITICAL - must match backend)
   ENCRYPTION_KEY=your-32-char-key

   # Groq (optional - for LLM)
   GROQ_API_KEY=gsk_...

   # Gemini (optional - for LLM)
   GEMINI_API_KEY=AI...

   # Environment
   NODE_ENV=production
   ```

   > ⚠️ **CRITICAL**: `ENCRYPTION_KEY` must be **identical** to your backend service. Integrations use encrypted tokens.

5. **Watch Paths** (optional optimization)

   Add these to redeploy only when sync-related code changes:
   ```
   apps/integration-sync/**
   apps/backend/src/db/**
   apps/backend/src/services/ingestion.service.ts
   apps/backend/src/services/vector.service.ts
   apps/backend/src/services/encryption.service.ts
   apps/backend/src/config.ts
   ```

6. **Deploy**
   - Click "**Deploy**"
   - First deployment builds and waits for first cron run
   - Check logs to verify initial sync succeeds

---

## Verification

### Check Cron Service

1. Go to Railway dashboard → `mitable-integration-sync` service
2. Click "**Deployments**" tab
3. You should see deployments at:
   - 12:00 AM UTC
   - 6:00 AM UTC
   - 12:00 PM UTC
   - 6:00 PM UTC

### Expected Log Output

```
======================================================================
🚀 RAILWAY CRON - INTEGRATION SYNC
======================================================================
⏰ Started at: 2025-11-19 12:00:00
======================================================================

======================================================================
📢 SLACK SYNC
======================================================================

📋 Found 2 Slack integration(s)

────────────────────────────────────────────────────────
📦 Organization: org-xyz123
🔄 Sync Mode: incremental
📅 Last sync: 11/19/2025, 6:00:00 AM
📊 Channels: 3
────────────────────────────────────────────────────────

📥 Fetching messages from C01ABC123...
   ✅ 15 messages fetched
📥 Fetching messages from C02DEF456...
   ✅ 8 messages fetched

✅ Slack sync complete for org-xyz123
   Total messages: 23

============================================================
📊 Slack Summary:
   Integrations: 2
   ✅ Success: 2
   ❌ Failed: 0
   Messages: 45
============================================================

======================================================================
📝 NOTION SYNC
======================================================================

📋 Found 1 Notion integration(s)

────────────────────────────────────────────────────────
📦 Organization: org-xyz123
🔄 Sync Mode: incremental
📅 Last synced: 11/19/2025, 6:00:00 AM
────────────────────────────────────────────────────────

📄 [1/5] Project Planning
📄 [2/5] Meeting Notes
📄 [3/5] Feature Specs
📄 [4/5] Team Docs
📄 [5/5] Roadmap Q4

✅ Notion sync complete for org-xyz123
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
⏰ Finished at: 2025-11-19 12:08:23
⏱️  Duration: 503s

📢 Slack:
   Integrations: 2
   ✅ Success: 2
   ❌ Failed: 0
   Messages: 45

📝 Notion:
   Integrations: 1
   ✅ Success: 1
   ❌ Failed: 0
   Pages: 5
======================================================================
```

### Check Backend Still Running

1. Go to `mitable-backend` service
2. Status should show "**Active**" (not restarting)
3. API endpoints should respond normally

---

## Cost Estimate

| Service | Type | Cost/Month |
|---------|------|------------|
| **Backend** | Web server (24/7) | ~$5-7 |
| **Cron Sync** | 4 runs/day × 10min | ~$1-2 |
| **Total** | | **~$6-9/month** |

> Railway Hobby Plan: $5/month base + usage

---

## Monitoring

### View Logs

**Cron Service:**
1. Railway Dashboard → `mitable-integration-sync`
2. Click "**Deployments**"
3. Select latest deployment
4. View real-time logs

**Backend Service:**
1. Railway Dashboard → `mitable-backend`
2. Click "**Deployments**"
3. View application logs

### Alerts

Set up Railway alerts for:
- ❌ Deployment failures
- ❌ Exit code 1 (sync failures)
- ⚠️ Long execution times (>15 min)

---

## Troubleshooting

### Cron Not Running

**Symptom:** No deployments at scheduled times

**Solutions:**
1. Verify cron schedule enabled in service settings
2. Check cron expression is `0 */6 * * *`
3. Ensure service deployed successfully
4. Check Railway status page for outages

### Environment Variable Errors

**Symptom:**
```
❌ Configuration error: PINECONE_API_KEY not found
```

**Solutions:**
1. Copy ALL variables from backend service
2. Verify variable names match exactly
3. Redeploy after adding variables

### Encryption Key Mismatch

**Symptom:**
```
❌ Failed to decrypt access token
```

**Solution:**
- `ENCRYPTION_KEY` must be **identical** in both services
- Copy directly from backend, don't regenerate

### Database Connection Failed

**Symptom:**
```
❌ Fatal error in Slack sync: Connection terminated
```

**Solutions:**
1. Verify `DATABASE_URL` is correct
2. Check Supabase connection pooler enabled
3. Ensure database accessible from Railway IPs
4. Verify `DIRECT_URL` for migrations

### No Integrations Found

**Symptom:**
```
📭 No Slack integrations found
📭 No Notion integrations found
```

**This is normal if:**
- No integrations connected yet
- Connect Slack/Notion through app first
- Sync will run automatically after connection

### Sync Takes Too Long

**Symptom:**
- Execution time > 15 minutes
- Railway timeout errors

**Solutions:**
1. Reduce number of selected Slack channels
2. Contact support if Notion has many pages (>1000)
3. Consider increasing timeout in Railway settings

---

## Updating the Sync Logic

When you push changes to sync code:

1. **Backend changes** → auto-deploys `mitable-backend`
2. **Sync changes** → auto-deploys `mitable-integration-sync`
3. Next cron run uses updated code

No manual intervention needed after merge to `main`.

---

## Changing Sync Frequency

Edit cron expression in Railway settings:

| Frequency | Cron Expression |
|-----------|----------------|
| Every 2 hours | `0 */2 * * *` |
| Every 4 hours | `0 */4 * * *` |
| Every 6 hours | `0 */6 * * *` (recommended) |
| Every 12 hours | `0 */12 * * *` |
| Daily at midnight | `0 0 * * *` |

> Minimum: 5 minutes (`*/5 * * * *`)

---

## Manual Sync Trigger

To manually trigger a sync without waiting for cron:

**Option 1: Railway Dashboard**
1. Go to `mitable-integration-sync` service
2. Click "**Deploy**" → "**Restart**"

**Option 2: Local Testing**
```bash
# From repo root
npm run start:integration-sync
```

**Option 3: API Endpoint** (if you add one to backend)
```bash
curl -X POST https://your-api.railway.app/api/admin/sync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Security Best Practices

✅ **DO:**
- Use Railway's secret management for API keys
- Enable Railway's private networking between services
- Rotate encryption keys periodically
- Monitor logs for suspicious activity

❌ **DON'T:**
- Commit `.env` files to Git
- Share encryption keys in plain text
- Use same keys across dev/prod
- Expose sync endpoints publicly without auth

---

## Support

- **Railway Docs**: https://docs.railway.com
- **Cron Jobs Reference**: https://docs.railway.com/reference/cron-jobs
- **Monorepo Guide**: https://docs.railway.com/guides/monorepo

For Mitable-specific issues, check:
- `apps/integration-sync/README.md`
- `docs/RAILWAY_CRON_SETUP.md`
