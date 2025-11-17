# 🚂 Railway Cron - Quick Reference

## ⚡ Quick Setup (5 minutes)

### 1. Create Service
Railway Dashboard → **+ New** → **Empty Service** → Name: `mitable-cron-sync`

### 2. Connect GitHub
**Settings** → **Source** → Connect to `Febchuk/mitable` → `main` branch

### 3. Configure Commands
```
Build: npm install
Start: npm run sync-integrations
Root: apps/backend
```

### 4. Copy Environment Variables
Copy ALL variables from main backend service → Paste into cron service

### 5. Enable Cron
**Settings** → **Cron Schedule** → Enable → `0 */6 * * *` → **Save**

### 6. Deploy
Click **Deploy** → Wait → Check logs

---

## 📊 Quick Test

**Local test:**
```bash
cd apps/backend
npm run sync-integrations
```

**Check Railway logs:**
Dashboard → Service → Deployments → Latest → View Logs

---

## 🔍 Quick Troubleshooting

| Issue | Quick Fix |
|-------|-----------|
| No integrations found | Normal - connect Slack/Notion first |
| Env var missing | Copy from main backend service |
| Cron not running | Enable in Settings → Cron Schedule |
| Timeout | Reduce sync frequency or channels |

---

## 📋 Cron Expressions

| Schedule | Expression |
|----------|-----------|
| Every 6 hours (default) | `0 */6 * * *` |
| Every 4 hours | `0 */4 * * *` |
| Every 12 hours | `0 */12 * * *` |
| Daily at midnight | `0 0 * * *` |

---

## 💰 Cost

- **~$6-7/month** total
- Only charged for execution time
- ~20 hours/month at 10 min per sync

---

## 📚 Full Guide

See [RAILWAY_CRON_SETUP.md](./RAILWAY_CRON_SETUP.md) for complete documentation.
