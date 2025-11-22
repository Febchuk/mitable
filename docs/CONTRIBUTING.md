# Contributing to Mitable

## Quick Setup

```bash
# Clone and install
git clone <repository-url>
cd mitable
npm install

# Build shared package (required)
npm run build --workspace=packages/shared

# Run the app
npm run dev:admin      # Admin experience (Dashboard, Integrations, Setup)
npm run dev:employee   # Employee experience (Home, Roadmap, Nudges, Chats)
```

## Development Workflow

All changes to `main` must go through Pull Requests. **Branch protection is enabled** to prevent breaking production.

### Safety Guardrails 🛡️

Our CI/CD pipeline ensures production stays stable:

- ✅ **No direct pushes to `main`** - All changes must go through PRs
- ✅ **CI must pass** - Tests, types, lint, and format checks are required
- ✅ **Preview deployments** - Every PR gets an isolated test environment
- ✅ **Production verification** - Health checks run after every deployment
- ✅ **Quick rollback** - Can revert to previous version in <1 minute

**These rules apply to everyone, including administrators.**

### 1. Create a feature branch

```bash
# Always start from latest main
git checkout main
git pull origin main

# Create your branch
git checkout -b feature/your-feature-name
# Or: fix/bug-name, refactor/component-name, docs/update-readme
```

### 2. Make your changes

Edit files in the appropriate workspace:

- `apps/backend/` - Express API
- `apps/electron/` - Desktop app (2 windows: Agent + Console)
- `packages/shared/` - Shared types and IPC channels

### 3. Run CI checks locally

**Before committing**, run the full CI suite locally:

```bash
npm run ci
```

This runs (in order):

1. ✅ Build shared package
2. ✅ Type checking
3. ✅ Linting
4. ✅ Format checking
5. ✅ Tests (53+ tests)
6. ✅ Build verification

If anything fails, fix it before committing.

### 4. Commit and push your changes

```bash
git add .
git commit -m "feat: add visual guidance overlay"
git push origin feature/your-feature-name
```

### 5. Open a Pull Request

1. Go to GitHub and create a PR from your branch to `main`
2. Fill in the PR description
3. **Automatic actions happen:**
   - ✅ CI workflow runs automatically
   - ✅ Railway creates preview deployment
   - ✅ Bot comments with preview URL in your PR

### 6. Test in Preview Environment

Every PR gets an **isolated preview deployment** with:

- 🌐 **Unique URL**: `https://mitable-pr-{number}.up.railway.app`
- 🗄️ **Dev Database**: Uses Supabase dev (not production!)
- 🔍 **Dev Vector Store**: Uses Pinecone `mitable-dev` index
- 🔒 **Isolated**: Your changes don't affect production

**How to test:**

1. Find the preview URL in the bot's comment on your PR
2. Click the health check link to verify deployment is ready
3. Test your changes thoroughly in the preview environment
4. Check Railway logs if something doesn't work
5. Push fixes and the preview will automatically redeploy

**Example Preview Comment:**

```
🚀 Preview Deployment

Your preview deployment will be ready shortly!

Preview URL: https://mitable-pr-123.up.railway.app

Environment Details:
• Database: Supabase Dev
• Vector Store: Pinecone Dev (mitable-dev)
• Environment: Development

Test Endpoints:
• Health Check: https://mitable-pr-123.up.railway.app/health
```

### 7. Get Review and Merge

1. Request review from a team member (optional but recommended)
2. Address any feedback by pushing new commits
3. **Required before merge:**
   - ✅ CI checks pass
   - ✅ All conversations resolved
   - ✅ At least 1 approval (if team policy requires it)
4. Click "Merge pull request" when ready
5. Preview environment **automatically deletes** after merge

### 8. Production Deployment

**Automatic process after merge:**

1. Railway auto-deploys to production from `main` branch
2. GitHub Actions workflow runs production health check
3. Verifies `/health` endpoint returns 200
4. **If health check fails:**
   - ❌ Workflow fails and alerts you
   - 🚨 Production may be broken
   - 📚 Follow rollback procedure (see below)

**Note:** You cannot merge until CI passes and approvals are met. This is enforced by branch protection.

### 9. Rollback Procedure (If Needed)

If production breaks after deployment, you can rollback quickly:

**Option 1: Railway CLI (Fastest - <1 minute)**

```bash
# Install Railway CLI if not already installed
npm install -g @railway/cli

# Login
railway login

# Rollback to previous deployment
railway rollback
```

**Option 2: Git Revert**

```bash
# Find the bad commit
git log --oneline -5

# Revert it
git revert <bad-commit-hash>

# Push to trigger new deployment
git push origin main
```

**Option 3: Redeploy Previous Working Commit**

```bash
# Reset to previous commit (locally only)
git reset --hard <good-commit-hash>

# Force push (use with caution!)
git push origin main --force
```

**After Rollback:**

1. Verify health: `curl https://mitablebackend-production.up.railway.app/health`
2. Check Railway logs: `railway logs`
3. Investigate the issue before trying again
4. See `docs/runbooks/rollback-procedure.md` for detailed steps

## Code Principles

### Modular Design

- Keep components focused and single-purpose
- Break large files into smaller, reusable modules
- Each function should do one thing well

### Multi-Service Architecture

We use a **loosely coupled architecture** to make it easy to swap services:

- **AI Services**: Gemini Vision → OpenAI → Claude (just update the adapter)
- **Database**: PostgreSQL → MySQL → MongoDB (abstracted through repository pattern)
- **Frontend**: React components are independent of data source
- **Backend**: Express routes → services → repositories (layered)

### Testing

Write tests for new features. Run `npm test` before committing.

## Commit Message Format

Use conventional commits:

```
type: short description

Examples:
feat: add expert matching algorithm
fix: resolve overlay positioning on multi-monitor
refactor: extract AI service into adapter pattern
test: add integration tests for roadmap API
docs: update architecture diagrams
```

## Available Commands

| Command                | Description                             |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Start all services                      |
| `npm run dev:admin`    | Run Electron in admin mode              |
| `npm run dev:employee` | Run Electron in employee mode           |
| `npm run build`        | Build all workspaces                    |
| `npm run test`         | Run all tests                           |
| `npm run ci`           | **Run all CI checks locally**           |
| `npm run typecheck`    | TypeScript type checking                |
| `npm run lint`         | ESLint                                  |
| `npm run format`       | Auto-fix formatting with Prettier       |
| `npm run format:check` | Check formatting (doesn't modify files) |

## Avoid Origin/Main Out-of-sync

# 1. Start new work - always create a branch

git checkout main
git pull origin main # Sync with remote first!
git checkout -b feature/your-feature-name

# 2. Make changes and commit

git add .
git commit -m "your changes"

# 3. Push your feature branch

git push origin feature/your-feature-name

# 4. Create Pull Request on GitHub

# - Review changes

# - Merge via GitHub UI

# 5. Update your local main

git checkout main
git pull origin main

# 6. Delete the feature branch (optional)

git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
