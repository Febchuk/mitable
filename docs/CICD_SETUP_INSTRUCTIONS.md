# CI/CD Setup Instructions - Next Steps

## ✅ What's Already Done

The following has been automatically configured:

### 1. GitHub Branch Protection ✅

- Direct pushes to `main` are **BLOCKED**
- All changes must go through Pull Requests
- CI checks are **required** before merge
- At least 1 approval required
- Conversation resolution required
- Rules apply to administrators too

**Verification:**

```bash
gh api repos/Febchuk/mitable/branches/main/protection
```

### 2. GitHub Workflows Created ✅

**Files created:**

- `.github/workflows/production-deploy.yml` - Production health verification
- `.github/workflows/pr-preview.yml` - PR preview URL automation

**What they do:**

- Production Deploy: Verifies `/health` endpoint after every merge to `main`
- PR Preview: Posts Railway preview URLs in PR comments automatically

### 3. Documentation Updated ✅

**Files updated:**

- `CONTRIBUTING.md` - Complete safety workflow documentation
- `README.md` - Added CI/CD status badges and quick links
- `docs/runbooks/rollback-procedure.md` - Comprehensive rollback guide

---

## 🔧 Manual Configuration Required

You need to complete these steps in external dashboards:

### Step 1: Enable Railway PR Deployments (15 minutes)

**Location:** Railway Dashboard

**Actions:**

1. Go to https://railway.app/dashboard
2. Select your Mitable project
3. Navigate to **Settings → Environments**
4. Click **"Enable PR Deployments"**
5. Configure:
   - ✅ **Create preview environment for each PR**: ON
   - ✅ **Base environment**: Production (to copy env vars)
   - ✅ **Auto-delete when PR closes**: ON
   - ✅ **Inherit environment variables from base**: ON

**What this does:**

- Creates an isolated deployment for every PR
- Uses pattern: `https://mitable-pr-{number}.up.railway.app`
- Automatically copies environment variables from production
- Cleans up preview environments when PRs are closed/merged

---

### Step 2: Configure Dev Environment Variables in Railway (30 minutes)

**Location:** Railway Dashboard → Environments → PR Deployments

**IMPORTANT:** Preview deployments should use **development** resources, not production!

**Required Environment Variables for Preview Deployments:**

```bash
# Database (Supabase Dev - NOT production!)
DATABASE_URL=<YOUR_SUPABASE_DEV_POOLER_URL>
DIRECT_URL=<YOUR_SUPABASE_DEV_DIRECT_URL>
SUPABASE_URL=<YOUR_SUPABASE_DEV_URL>
SUPABASE_ANON_KEY=<YOUR_SUPABASE_DEV_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SUPABASE_DEV_SERVICE_ROLE_KEY>

# Vector Database (Pinecone Dev - NOT production!)
PINECONE_API_KEY=<YOUR_PINECONE_API_KEY>  # Same as prod
PINECONE_INDEX_NAME=mitable-dev            # Different index!

# AI Services (Same as production - safe to reuse)
OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
GROQ_API_KEY=<YOUR_GROQ_API_KEY>

# OAuth (Use dev credentials or same as prod)
SLACK_CLIENT_ID=<YOUR_SLACK_CLIENT_ID>
SLACK_CLIENT_SECRET=<YOUR_SLACK_CLIENT_SECRET>
NOTION_CLIENT_ID=<YOUR_NOTION_CLIENT_ID>
NOTION_CLIENT_SECRET=<YOUR_NOTION_CLIENT_SECRET>
OAUTH_REDIRECT_BASE_URL=https://mitable-pr-{number}.up.railway.app

# Security (Same as production)
JWT_SECRET=<YOUR_JWT_SECRET>
ENCRYPTION_KEY=<YOUR_ENCRYPTION_KEY>

# Environment
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=*  # Or specific preview URLs

# Debug (Optional)
DEBUG_SAVE_SCREENSHOTS=false
DEBUG_SCREENSHOTS_DIR=/tmp/mitable-debug-screenshots
```

**Where to find these values:**

Your local `.env` file in `/apps/backend/.env` should already have the dev credentials.

**Steps:**

1. Open Railway Dashboard → Your Project → Environments
2. Select **PR Deployments** environment (create if not exists)
3. Go to **Variables** tab
4. Add each variable above with the dev values
5. Click **Save**

**Verification:**

- Preview deployments will use these variables automatically
- Production deployments will continue using production variables

---

### Step 3: Get Railway API Token (5 minutes)

**Location:** Railway Account Settings

**Actions:**

1. Go to https://railway.app/account/tokens
2. Click **"Create New Token"**
3. Name: `GitHub Actions CI/CD`
4. Scopes: Leave default (full access)
5. **Copy the token** (shown only once!)
6. Save it securely

**Next:** Add this token to GitHub secrets (Step 4)

---

### Step 4: Add Railway Token to GitHub Secrets (5 minutes)

**Using GitHub CLI:**

```bash
# Set the Railway token as a GitHub secret
gh secret set RAILWAY_TOKEN
# Paste your Railway token when prompted
```

**Or via GitHub Web UI:**

1. Go to https://github.com/Febchuk/mitable/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `RAILWAY_TOKEN`
4. Value: [paste token from Step 3]
5. Click **"Add secret"**

**Verification:**

```bash
# List secrets (won't show values, just names)
gh secret list
# Should see: RAILWAY_TOKEN
```

---

### Step 5: Verify Dev Environments Exist (15 minutes)

**Supabase Dev Project:**

1. Go to https://supabase.com/dashboard/projects
2. Verify you have a **dev** project (separate from production)
3. If not, create one:
   - Click **"New Project"**
   - Name: `mitable-dev`
   - Region: Same as production
   - Create project
4. Run migrations on dev database:
   ```bash
   cd apps/backend
   export DATABASE_URL="<supabase-dev-direct-url>"
   npm run db:migrate
   ```

**Pinecone Dev Index:**

1. Go to https://app.pinecone.io/
2. Verify you have `mitable-dev` index
3. If not, create one:
   - Index name: `mitable-dev`
   - Dimensions: `1536` (must match production)
   - Metric: `cosine` (must match production)
   - Region: Same as production
   - Create index

**Verification:**

```bash
# Test dev database connection
DATABASE_URL="<dev-url>" npm run db:studio

# Test Pinecone dev index (in backend)
PINECONE_INDEX_NAME=mitable-dev npm run test-search
```

---

## 🧪 Testing the Full Pipeline (30 minutes)

Once Steps 1-5 are complete, test the entire workflow:

### Test 1: Create Test PR

```bash
git checkout main
git pull origin main
git checkout -b test/verify-cicd-pipeline

# Make a small change
echo "# CI/CD Test" >> README.md

git add README.md
git commit -m "test: verify CI/CD pipeline is working"
git push origin test/verify-cicd-pipeline
```

### Test 2: Open PR on GitHub

1. Go to https://github.com/Febchuk/mitable
2. Click **"Compare & pull request"**
3. Fill in title and description
4. Click **"Create pull request"**

### Test 3: Verify Automatic Actions

**Should happen automatically:**

1. ✅ CI workflow runs (tests, lint, typecheck)
   - Check: https://github.com/Febchuk/mitable/actions

2. ✅ Railway creates preview deployment
   - Check Railway dashboard for new deployment

3. ✅ Bot comments with preview URL
   - Check PR for comment with `https://mitable-pr-{number}.up.railway.app`

4. ✅ Preview deployment is accessible
   - Click the health check link in the comment
   - Should return `{"status":"ok"}`

### Test 4: Verify Preview Environment

```bash
# Get the preview URL from the PR comment
PREVIEW_URL="https://mitable-pr-{number}.up.railway.app"

# Test health endpoint
curl $PREVIEW_URL/health
# Expected: {"status":"ok"}

# Check Railway logs for the preview deployment
railway logs --service backend --environment pr-{number}
```

### Test 5: Merge and Verify Production

1. Click **"Merge pull request"** on GitHub
2. Wait for automatic actions:
   - ✅ Railway deploys to production
   - ✅ Production Deploy workflow runs
   - ✅ Health check verifies deployment
   - ✅ Preview environment auto-deletes

3. Verify production:

   ```bash
   curl https://mitablebackend-production.up.railway.app/health
   # Expected: {"status":"ok"}
   ```

4. Check GitHub Actions:
   - Go to https://github.com/Febchuk/mitable/actions
   - Verify "Production Deploy" workflow passed ✅

---

## 🎉 Success Criteria

After completing all steps, you should have:

✅ **Branch Protection Working**

- Cannot push directly to `main`
- CI must pass before merge
- At least 1 approval required

✅ **Preview Deployments Working**

- Every PR gets unique preview URL
- Preview uses dev database/Pinecone
- Preview auto-deletes on PR close

✅ **Production Verification Working**

- Health checks run after merge to main
- Alerts if health check fails
- Deployment status visible in GitHub Actions

✅ **Clear Documentation**

- CONTRIBUTING.md explains the workflow
- README.md has status badges
- Rollback procedures documented

✅ **Safety Guarantees**

- No one can break production without review
- All changes tested in preview first
- Quick rollback if something goes wrong

---

## 📚 Troubleshooting

### Preview URL not working

**Check:**

1. Railway preview deployment exists in dashboard
2. Deployment logs for errors
3. Environment variables are set correctly
4. Health endpoint returns 200

**Fix:**

- Verify dev database credentials
- Check Railway logs for startup errors
- Ensure `NODE_ENV=development`

### Bot not commenting on PRs

**Check:**

1. `RAILWAY_TOKEN` secret exists in GitHub
2. PR Preview workflow ran successfully
3. GitHub Actions has permission to comment

**Fix:**

```bash
# Verify secret exists
gh secret list | grep RAILWAY_TOKEN

# Manually trigger workflow
gh workflow run pr-preview.yml
```

### Branch protection not working

**Check:**

```bash
gh api repos/Febchuk/mitable/branches/main/protection
```

**Fix:**
Re-run the branch protection command from this repo's implementation.

### Health check failing

**Check:**

```bash
curl https://mitablebackend-production.up.railway.app/health
```

**Fix:**

- Check Railway production logs
- Verify database connectivity
- Check for runtime errors

---

## 🔗 Quick Reference Links

**GitHub:**

- Repository: https://github.com/Febchuk/mitable
- Actions: https://github.com/Febchuk/mitable/actions
- Branch Protection: https://github.com/Febchuk/mitable/settings/branches
- Secrets: https://github.com/Febchuk/mitable/settings/secrets/actions

**Railway:**

- Dashboard: https://railway.app/dashboard
- Account Tokens: https://railway.app/account/tokens

**Supabase:**

- Dashboard: https://supabase.com/dashboard/projects

**Pinecone:**

- Dashboard: https://app.pinecone.io/

**Documentation:**

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development workflow
- [Rollback Procedure](./runbooks/rollback-procedure.md) - Emergency rollback guide
- [CI/CD Implementation Plan](./CICD_IMPLEMENTATION_PLAN.md) - Full implementation details

---

## 📞 Need Help?

If you encounter issues:

1. Check GitHub Actions logs for errors
2. Check Railway deployment logs
3. Review CONTRIBUTING.md for workflow details
4. Check rollback-procedure.md if production is broken
5. Create an issue in GitHub with:
   - What you were trying to do
   - What happened instead
   - Relevant logs/screenshots
