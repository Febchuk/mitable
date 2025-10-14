# Contributing to Mitable

## Quick Start

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

## Contributing Workflow

### 1. Create a branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### 2. Make your changes

Edit files in the appropriate workspace:
- `apps/backend/` - Express API
- `apps/electron/` - Desktop app (5 windows)
- `packages/shared/` - Shared types and IPC channels

### 3. Run checks

```bash
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run format       # Prettier (auto-fixes)
```

### 4. Commit and push

```bash
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature-name
```

### 5. Open a Pull Request

1. Go to GitHub and create a PR from your branch to `main`
2. Fill in the PR description
3. Wait for CI checks to pass (automatic)

## CI Checks (Runs on PR and Merge to Main)

When you open a PR or merge to main, GitHub Actions automatically runs:
- ✅ Type checking
- ✅ Linting
- ✅ Format checking
- ✅ Build verification

View runs in the "Actions" tab on GitHub.

## Need Help?

- Check `README.md` for architecture details
- See `CLAUDE.md` for development patterns
- Review `docs/mitable_complete_prd.md` for feature specs
