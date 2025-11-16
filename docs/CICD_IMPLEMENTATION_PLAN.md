# CI/CD Implementation Plan for Mitable

> **Repository:** https://github.com/Febchuk/mitable
>
> **Current Status:** Basic CI implemented, Production Railway deployment active
>
> **Target:** Full trunk-based CI/CD with preview deployments

---

## Current State (Already Implemented)

### ✅ GitHub Actions CI Workflow

**File:** `.github/workflows/ci.yml`

**What it does:**

- ✅ Runs on every PR and push to main
- ✅ Installs dependencies
- ✅ Builds shared package
- ✅ Type checking (TypeScript)
- ✅ Linting (ESLint)
- ✅ Format checking (Prettier)
- ✅ Runs all tests
- ✅ Builds all workspaces

**Triggers:**

- Push to `main` branch
- Pull requests to `main` branch

### ✅ npm Scripts (Root package.json)

- `npm run test` - Run all tests
- `npm run typecheck` - TypeScript checks
- `npm run lint` - ESLint
- `npm run format:check` - Prettier checks
- `npm run build` - Build all packages
- `npm run ci` - Full CI check locally

### ✅ Railway Production Deployment

- Connected to `main` branch
- Auto-deploys on merge to main
- URL: https://mitablebackend-production.up.railway.app
- Database: Supabase Production
- Pinecone: mitable-production index

---

## What Still Needs to Be Implemented

### 🔲 Phase 1: Railway Preview Deployments (1-2 hours)

**Goal:** Automatically create preview deployments for every PR

#### Step 1.1: Enable PR Previews in Railway Dashboard

**Location:** Railway Dashboard → Project Settings → Environments

**Actions:**

1. Go to https://railway.app/dashboard
2. Select your Mitable project
3. Navigate to Settings → Environments
4. Click "Enable PR Deployments"
5. Configure:
   - ✅ Create preview environment for each PR
   - ✅ Base environment: `production` (to copy env vars)
   - ✅ Auto-delete when PR closes: Yes
   - ✅ Inherit environment variables from base

#### Step 1.2: Configure Dev Environment Variables in Railway

**Location:** Railway Dashboard → Environment Variables

**Required Variables for Preview Deployments:**

```bash
# Database (Supabase Dev Project)
DATABASE_URL=<SUPABASE_DEV_POOLER_URL>
DIRECT_URL=<SUPABASE_DEV_DIRECT_URL>
SUPABASE_URL=<DEV_SUPABASE_URL>
SUPABASE_ANON_KEY=<DEV_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<DEV_SERVICE_ROLE_KEY>

# Pinecone (Dev Index)
PINECONE_INDEX_NAME=mitable-dev
PINECONE_API_KEY=<SAME_AS_PROD>

# AI Services (Same as prod - safe to use for dev)
OPENAI_API_KEY=<SAME_AS_PROD>
GEMINI_API_KEY=<SAME_AS_PROD>
GROQ_API_KEY=<SAME_AS_PROD>

# OAuth (Dev credentials or same as prod)
SLACK_CLIENT_ID=<SAME_OR_DEV_SPECIFIC>
SLACK_CLIENT_SECRET=<SAME_OR_DEV_SPECIFIC>
NOTION_CLIENT_ID=<SAME_OR_DEV_SPECIFIC>
NOTION_CLIENT_SECRET=<SAME_OR_DEV_SPECIFIC>

# Security
JWT_SECRET=<SAME_AS_PROD>
ENCRYPTION_KEY=<SAME_AS_PROD>

# Environment
NODE_ENV=development
```

**Note:** Preview deployments will automatically use these dev environment variables.

---

### 🔲 Phase 2: PR Preview Comment Workflow (30 minutes)

**Goal:** Automatically comment Railway preview URL on PRs

#### Step 2.1: Get Railway API Token

**Location:** Railway Dashboard → Account Settings → Tokens

**Actions:**

1. Go to https://railway.app/account/tokens
2. Click "Create New Token"
3. Name: `GitHub Actions CI/CD`
4. Copy token (shown only once!)
5. Save for next step

#### Step 2.2: Add GitHub Secret

**Location:** GitHub Repository → Settings → Secrets and Variables → Actions

**Actions:**

1. Go to https://github.com/Febchuk/mitable/settings/secrets/actions
2. Click "New repository secret"
3. Name: `RAILWAY_TOKEN`
4. Value: <paste token from 2.1>
5. Click "Add secret"

#### Step 2.3: Create PR Comment Workflow

**File:** `.github/workflows/pr-preview.yml`

**Purpose:**

- Posts Railway preview URL in PR comments
- Updates comment on each push
- Shows deployment status

**Implementation:**

```yaml
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  comment-preview-url:
    name: Comment Preview URL
    runs-on: ubuntu-latest
    steps:
      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const prNumber = context.issue.number;
            const previewUrl = `https://mitable-pr-${prNumber}.up.railway.app`;

            const comment = `## 🚀 Preview Deployment

            Your preview deployment is ready!

            **URL:** ${previewUrl}

            **Environment:**
            - Database: Supabase Dev
            - Pinecone: mitable-dev

            **Test Endpoints:**
            - Health: ${previewUrl}/health
            - API Docs: ${previewUrl}/api-docs

            Preview will auto-delete when PR is closed.`;

            // Find existing comment
            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: prNumber,
            });

            const botComment = comments.data.find(comment =>
              comment.user.type === 'Bot' &&
              comment.body.includes('Preview Deployment')
            );

            if (botComment) {
              // Update existing comment
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body: comment
              });
            } else {
              // Create new comment
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber,
                body: comment
              });
            }
```

---

### 🔲 Phase 3: Production Deployment Workflow (1 hour)

**Goal:** Automate production deployment with safety checks

#### Step 3.1: Create Production Deploy Workflow

**File:** `.github/workflows/production-deploy.yml`

**Purpose:**

- Runs only when code merges to `main`
- Verifies deployment health
- Optional: Slack notification

**Implementation:**

```yaml
name: Production Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Wait for Railway deployment
        run: |
          echo "Railway is auto-deploying from main branch..."
          echo "Waiting 2 minutes for deployment..."
          sleep 120

      - name: Verify deployment
        run: |
          echo "Checking health endpoint..."
          response=$(curl -s -o /dev/null -w "%{http_code}" https://mitablebackend-production.up.railway.app/health)

          if [ $response -eq 200 ]; then
            echo "✅ Deployment successful! Health check passed."
          else
            echo "❌ Deployment failed! Health check returned $response"
            exit 1
          fi

      - name: Notify success
        if: success()
        run: |
          echo "🚀 Production deployment successful!"
          echo "URL: https://mitablebackend-production.up.railway.app"
```

---

### 🔲 Phase 4: GitHub Branch Protection (15 minutes)

**Goal:** Prevent direct pushes to main, require CI checks

#### Step 4.1: Configure Branch Protection Rules

**Location:** GitHub Repository → Settings → Branches

**Actions:**

1. Go to https://github.com/Febchuk/mitable/settings/branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Configure:

**Required Settings:**

```
✅ Require a pull request before merging
   └─ Require approvals: 1 (recommended)
   └─ Dismiss stale pull request approvals when new commits are pushed

✅ Require status checks to pass before merging
   └─ Require branches to be up to date before merging
   └─ Status checks that are required:
       • ci / Build and Test

✅ Require conversation resolution before merging

✅ Include administrators
   └─ Apply rules to admins too
```

**Optional Settings:**

```
☐ Require signed commits
☐ Require linear history
☐ Require deployments to succeed before merging
```

5. Click "Create" or "Save changes"

**Result:** No one can push directly to `main` - all changes must go through PRs with passing CI.

---

### 🔲 Phase 5: Supabase Dev Environment (30 minutes)

**Goal:** Set up separate dev database for testing

#### Step 5.1: Create Supabase Dev Project (if not exists)

**Location:** Supabase Dashboard → https://supabase.com/dashboard/projects

**Actions:**

1. Click "New Project"
2. Organization: Same as production
3. Name: `mitable-dev`
4. Database Password: Generate strong password (save it!)
5. Region: Same as production (for consistency)
6. Pricing Plan: Free (for dev) or Pro (if needed)
7. Click "Create new project"
8. Wait 2-3 minutes for provisioning

#### Step 5.2: Copy Connection Strings

**Location:** Supabase Dev Project → Settings → Database

**Get these values:**

- Connection Pooling URL (port 6543) → `DATABASE_URL`
- Direct Connection URL (port 5432) → `DIRECT_URL`
- Project URL → `SUPABASE_URL`
- Anon Key (Settings → API) → `SUPABASE_ANON_KEY`
- Service Role Key (Settings → API) → `SUPABASE_SERVICE_ROLE_KEY`

#### Step 5.3: Run Migrations on Dev Database

**From terminal:**

```bash
cd /Users/febechukwuma/Documents/mitable/apps/backend

# Set dev database URL
export DATABASE_URL="<SUPABASE_DEV_DIRECT_URL>"

# Run migrations
npm run db:migrate

# Verify in Drizzle Studio
npm run db:studio
```

#### Step 5.4: Seed Dev Database with Test Data

**From terminal:**

```bash
# Create seed script or use existing
DATABASE_URL="<SUPABASE_DEV_DIRECT_URL>" npm run db:seed
```

**Expected Data:**

- 1-2 test organizations
- 5-10 test users
- Sample roadmap templates
- Test conversations
- Test source materials

---

### 🔲 Phase 6: Pinecone Dev Index (15 minutes)

**Goal:** Separate vector database for dev testing

#### Step 6.1: Create Dev Pinecone Index

**Location:** Pinecone Dashboard → https://app.pinecone.io/

**Actions:**

1. Click "Create Index"
2. Index Name: `mitable-dev`
3. Dimensions: `1536` (must match prod)
4. Metric: `cosine` (must match prod)
5. Region: Same as production
6. Pod Type: `p1.x1` (cheapest for dev)
7. Click "Create Index"

#### Step 6.2: Verify Index Configuration

**From terminal:**

```bash
cd /Users/febechukwuma/Documents/mitable/apps/backend

# Test connection
PINECONE_INDEX_NAME=mitable-dev npm run test-search
```

---

### 🔲 Phase 7: Testing the Pipeline (1-2 hours)

**Goal:** Verify entire CI/CD workflow end-to-end

#### Step 7.1: Create Test PR

**From terminal:**

```bash
git checkout main
git pull origin main
git checkout -b test/cicd-pipeline

# Make a small change
echo "# CI/CD Pipeline" >> README.md

git add README.md
git commit -m "test: verify CI/CD pipeline setup"
git push origin test/cicd-pipeline
```

**On GitHub:**

1. Create PR from `test/cicd-pipeline` → `main`
2. Watch for:
   - ✅ CI workflow runs
   - ✅ Railway creates preview deployment
   - ✅ Bot comments with preview URL

#### Step 7.2: Verify Preview Deployment

**In browser:**

1. Click preview URL in PR comment
2. Test endpoints:
   - https://mitable-pr-X.up.railway.app/health
   - https://mitable-pr-X.up.railway.app/api-docs

**Expected:**

- ✅ Health endpoint returns 200
- ✅ API docs load correctly
- ✅ Railway logs show dev database connection

#### Step 7.3: Test Production Deploy

**On GitHub:**

1. Merge the test PR
2. Watch for:
   - ✅ Production deploy workflow runs
   - ✅ Railway deploys to production
   - ✅ Health check passes

**Verify:**

- https://mitablebackend-production.up.railway.app/health

#### Step 7.4: Verify Cleanup

**After merge:**

- ✅ Preview deployment auto-deletes
- ✅ PR shows as merged
- ✅ Production is stable

---

## Optional Enhancements

### 🔲 Slack Notifications (30 minutes)

**Goal:** Get notified in Slack when deployments happen

#### Setup Steps:

1. Create Slack incoming webhook
2. Add `SLACK_WEBHOOK_URL` to GitHub secrets
3. Update production-deploy.yml with notification step

**Notification Example:**

```
🚀 Production Deploy: SUCCESS
Commit: feat: add user management
Author: @febchuk
URL: https://mitablebackend-production.up.railway.app
```

---

### 🔲 Database Migration Automation (1 hour)

**Goal:** Run migrations automatically before deployment

**Implementation:**

- Add migration step to production-deploy.yml
- Use DIRECT_URL for migrations
- Rollback on failure

---

### 🔲 Electron Release Workflow (2-3 hours)

**Goal:** Automated desktop app builds and releases

**Triggers:** Git tags (v1.0.0, v1.0.1, etc.)

**Outputs:**

- macOS DMG (signed)
- Windows installer (signed)
- Linux AppImage
- GitHub Release with changelog

**Implementation:**

- Code signing certificates required
- electron-builder configuration
- Auto-update server manifest

---

## Implementation Checklist

### Week 1: Core Setup (3-4 hours)

- [ ] **Phase 1:** Enable Railway PR previews (30 min)
- [ ] **Phase 1:** Configure dev env vars in Railway (30 min)
- [ ] **Phase 2:** Get Railway API token (5 min)
- [ ] **Phase 2:** Add GitHub secret (5 min)
- [ ] **Phase 2:** Create pr-preview.yml workflow (20 min)
- [ ] **Phase 3:** Create production-deploy.yml workflow (30 min)
- [ ] **Phase 4:** Configure branch protection rules (15 min)
- [ ] **Phase 5:** Set up Supabase dev project (30 min)
- [ ] **Phase 5:** Run migrations on dev DB (15 min)
- [ ] **Phase 6:** Create Pinecone dev index (15 min)

### Week 2: Testing & Polish (2-3 hours)

- [ ] **Phase 7:** Create test PR (15 min)
- [ ] **Phase 7:** Verify preview deployment (30 min)
- [ ] **Phase 7:** Test production deploy (30 min)
- [ ] **Phase 7:** Verify cleanup (15 min)
- [ ] Create CONTRIBUTING.md (30 min)
- [ ] Update README.md with badges (15 min)
- [ ] Document rollback procedures (30 min)

### Optional (Later)

- [ ] Set up Slack notifications
- [ ] Automate database migrations
- [ ] Electron release workflow
- [ ] Add smoke tests
- [ ] Set up error monitoring

---

## Success Criteria

After implementation, you should be able to:

✅ Create feature branch → PR → Automatic CI runs
✅ PR gets Railway preview URL automatically
✅ Preview deployment uses dev database/Pinecone
✅ Merge PR → Automatic production deploy
✅ Production health check verifies deployment
✅ No direct pushes to main (branch protection)
✅ Rollback in < 1 minute if needed

---

## Rollback Procedures

### If Preview Deployment Breaks

- PR preview issues don't affect production
- Close PR or push fixes
- Preview auto-deletes when PR closes

### If Production Deployment Breaks

**Option 1: Revert Commit**

```bash
git revert <commit-hash>
git push origin main
# Railway auto-deploys revert
```

**Option 2: Railway Rollback**

```bash
railway rollback
# Returns to previous deployment instantly
```

**Option 3: Hotfix**

```bash
git checkout -b hotfix/critical-fix
# Fix the issue
# Create PR, get quick review, merge
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Developer Workflow                                     │
└─────────────────────────────────────────────────────────┘
           │
           ├─> Create feature branch
           │
           ├─> Push code
           │
           ├─> Create Pull Request
           │   │
           │   ├──> GitHub Actions: CI Workflow ✅
           │   │    • Tests
           │   │    • Type check
           │   │    • Lint
           │   │    • Build
           │   │
           │   ├──> Railway: Create Preview ✅
           │   │    • URL: mitable-pr-X.up.railway.app
           │   │    • Database: Supabase Dev
           │   │    • Pinecone: mitable-dev
           │   │
           │   └──> GitHub: Post Comment ✅
           │        • Preview URL
           │        • Test endpoints
           │
           ├─> Code Review & Testing
           │
           ├─> Merge PR
           │   │
           │   ├──> Railway: Deploy Production ✅
           │   │    • Auto-deploy from main
           │   │    • Database: Supabase Prod
           │   │    • Pinecone: mitable-production
           │   │
           │   ├──> GitHub Actions: Verify Deployment ✅
           │   │    • Health check
           │   │    • Smoke tests
           │   │
           │   └──> Railway: Delete Preview ✅
           │        • Auto-cleanup
           │
           └─> 🎉 Production Updated!
```

---

## Resources & Links

**Railway:**

- Dashboard: https://railway.app/dashboard
- Project: https://railway.app/project/your-project-id
- Docs: https://docs.railway.app/

**GitHub:**

- Repository: https://github.com/Febchuk/mitable
- Actions: https://github.com/Febchuk/mitable/actions
- Branch Protection: https://github.com/Febchuk/mitable/settings/branches

**Supabase:**

- Production: https://lbudgeprqnhellzakkvy.supabase.co
- Dev: <to be created>

**Pinecone:**

- Production Index: mitable-production
- Dev Index: mitable-dev

---

## Next Steps

1. **Review this plan** - Understand each phase
2. **Start with Phase 1** - Railway preview setup (easiest win)
3. **Test with a dummy PR** - Verify preview works
4. **Add branch protection** - Prevent accidents
5. **Document for team** - Everyone follows same workflow

**Estimated Total Time:** 5-7 hours over 1-2 weeks

**Questions?** Ask before starting implementation!
