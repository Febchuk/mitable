# Integration Sync Service

Standalone Railway cron service for syncing Slack and Notion integrations.

## Purpose

This service runs independently from the main backend web server to avoid downtime during sync operations. Railway cron jobs require the service to terminate after completion, which would shut down the main API if they shared the same service.

## Architecture

- **Isolated Service**: Runs in its own Railway service container
- **Shared Codebase**: Imports database, services, and config from `@mitable/backend`
- **Clean Exit**: Terminates with appropriate exit code after sync completes

## Schedule

- **Cron Expression**: `0 */6 * * *`
- **Frequency**: Every 6 hours (12 AM, 6 AM, 12 PM, 6 PM UTC)
- **Duration**: ~5-10 minutes per sync

## Environment Variables

Required (same as backend):

```bash
# Database
DATABASE_URL
DIRECT_URL

# Supabase
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# OpenAI (for embeddings)
OPENAI_API_KEY

# Pinecone
PINECONE_API_KEY
PINECONE_INDEX_NAME

# OAuth Clients
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
NOTION_CLIENT_ID
NOTION_CLIENT_SECRET

# Encryption
ENCRYPTION_KEY

# Environment
NODE_ENV=production
```

## Local Development

```bash
# Install dependencies (from root)
npm install

# Run sync
npm run start --workspace=apps/integration-sync

# Watch mode
npm run dev --workspace=apps/integration-sync
```

## Railway Deployment

### Service Configuration

1. **Create New Service**:
   - Name: `mitable-integration-sync`
   - Repository: `Febchuk/mitable`
   - Branch: `main`

2. **Settings**:
   - **Root Directory**: `apps/integration-sync`
   - **Build Command**: `npm install` (auto-detected)
   - **Start Command**: `npm run start`
   - **Cron Schedule**: `0 */6 * * *`

3. **Environment Variables**: Copy all from main backend service

### Deployment Process

1. Push changes to `main` branch
2. Railway auto-deploys the service
3. First cron run executes at next scheduled time
4. Monitor logs in Railway dashboard

## What Gets Synced

### Slack
- All configured integrations
- Incremental message sync (only new messages since last sync)
- Fetches messages from selected channels only

### Notion
- All configured integrations  
- Incremental page sync (only changed pages since last sync)
- Block-level embedding for granular search

## Exit Codes

- `0`: Success (all syncs completed without errors)
- `1`: Failure (one or more syncs failed)

Railway uses these codes to determine sync status.

## Monitoring

Check Railway deployment logs for:
- Sync start/end times
- Number of messages/pages processed
- Success/failure status per integration
- Error messages and stack traces

## Cost

- **Execution**: ~20 hours/month (4 syncs × 10 min × 30 days)
- **Estimated**: $1-2/month (in addition to main backend service)

## Troubleshooting

### Sync not running
- Verify cron schedule is enabled in Railway settings
- Check service deployed successfully
- Ensure cron expression is valid

### Environment variable errors
- Copy ALL variables from main backend service
- Verify `ENCRYPTION_KEY` matches (required for encrypted tokens)

### Database connection failures
- Check `DATABASE_URL` is correct
- Verify database allows connections from Railway IPs
- Ensure Supabase connection pooler is enabled

### No integrations found
- Normal if no Slack/Notion integrations connected yet
- Connect integrations through main app first
