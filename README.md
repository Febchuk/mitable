# Mitable

[![CI](https://github.com/Febchuk/mitable/workflows/CI/badge.svg)](https://github.com/Febchuk/mitable/actions/workflows/ci.yml)
[![Production Deploy](https://github.com/Febchuk/mitable/workflows/Production%20Deploy/badge.svg)](https://github.com/Febchuk/mitable/actions/workflows/production-deploy.yml)
[![Production Status](https://img.shields.io/badge/production-deployed-success)](https://mitablebackend-production.up.railway.app/health)

A desktop app that passively captures how you work (screenshots, activity, app context) and uses AI to help you understand your time, draft work updates, and give management visibility.

## Quick Links

- **Production**: [https://mitablebackend-production.up.railway.app](https://mitablebackend-production.up.railway.app)
- **CI/CD Pipeline**: [GitHub Actions](https://github.com/Febchuk/mitable/actions)
- **Contributing**: [CONTRIBUTING.md](docs/CONTRIBUTING.md)
- **Project Instructions**: [CLAUDE.md](CLAUDE.md)

## Project Structure

```
mitable/
├── apps/
│   ├── backend/              # Express API server (domain-based modules)
│   │   └── src/domains/      # capture, sessions, workstreams, insights,
│   │                         # benchmarks, updates, agent, integrations,
│   │                         # auth, shared-infra
│   ├── electron/             # Electron desktop app (multi-window)
│   │   └── src/
│   │       ├── main.ts       # Main process
│   │       ├── preload/      # Preload scripts
│   │       ├── services/     # Electron-side services (capture, monitoring)
│   │       └── renderer/     # React apps per window
│   │           ├── console/  # Main workspace hub
│   │           ├── watchButton/      # Floating trigger button
│   │           ├── watchingPill/     # Active monitoring indicator
│   │           ├── watchingPillDropdown/
│   │           └── notifications/   # System notifications
│   ├── website/              # Next.js marketing + billing site
│   └── chrome-extension/     # Browser extension for web context
└── packages/
    └── shared/               # Shared types, Zod schemas, IPC channels
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
npm install
npm run build --workspace=packages/shared  # Required first
```

### Development

```bash
# Start all services (Backend API + Electron)
npm run dev              # Employee mode (default)
npm run dev:admin        # Admin mode

# Individual workspaces
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/electron
```

### Console Modes

- **Employee Mode** (default): Home, activity insights, benchmarks, updates
- **Admin Mode**: Dashboard (team analytics), Integrations, Setup

### Building & Testing

```bash
npm run build            # Build all packages
npm run typecheck        # Type check all workspaces
npm run lint             # Lint all workspaces
npm run test             # Run all tests
npm run format           # Format all files
```

## Tech Stack

- **Desktop**: Electron + React 18 + TypeScript + Tailwind CSS v3 + electron-vite
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM (ESM)
- **Website**: Next.js 15 + React 19 + Tailwind CSS v4 + Supabase Auth
- **Database**: PostgreSQL (Supabase) + Pinecone (vector embeddings)
- **AI**: Google Gemini 2.5 Flash (Vision), OpenAI embeddings, Groq (chat)
- **Payments**: Stripe (billing, subscriptions)
- **Monorepo**: npm workspaces + Turborepo

## Core Features

1. **Work Context Capture** — Passive screenshot capture + active window detection
2. **Activity Tracking** — Keyboard, mouse, clipboard events via uiohook-napi
3. **Session Management** — Focused (manual) and passive (auto-detected) sessions
4. **AI Processing** — Frame analysis, classification, summarization, vector indexing
5. **Time Insights** — How you spend time across apps, projects, workstreams
6. **Benchmarks** — Individual and team performance metrics
7. **Update Drafting** — AI-assisted work updates (BragBook) from session data
8. **Agent Tab** — AI assistant answering questions about your work context
9. **Integrations** — Slack, Notion, GitHub, Granola, Fireflies, Gmail, Linear
10. **Auth & Billing** — Organization management, teams, Stripe subscriptions

## Documentation

- **Architecture Decision Record**: `docs/adr/v1-architecture.md`
- **Architecture Guide**: `docs/Electron_Express_monorepo_UPDATED.md`
- **Changelog**: `docs/CHANGELOG.md`

## License

Proprietary - Mitable Inc.
