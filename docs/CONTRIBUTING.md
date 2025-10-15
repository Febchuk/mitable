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

All changes to `main` must go through Pull Requests. Branch protection is enabled.

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
- `apps/electron/` - Desktop app (5 windows)
- `packages/shared/` - Shared types and IPC channels

### 3. Run CI checks locally

**Before committing**, run the full CI suite locally:

```bash
npm run ci
```

This runs (in order):

1. ✅ Type checking
2. ✅ Linting
3. ✅ Format checking
4. ✅ Tests (21 tests)
5. ✅ Build verification

If anything fails, fix it before committing.

### 4. Commit your changes

```bash
git add .
git commit -m "feat: add visual guidance overlay"
git push origin feature/your-feature-name
```

### 5. Open a Pull Request

1. Go to GitHub and create a PR from your branch to `main`
2. Fill in the description
3. Wait for CI checks to pass (required)
4. Request review #optional
5. Merge when approved ✅

**Note:** You cannot merge until CI passes. This is enforced by branch protection.

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
