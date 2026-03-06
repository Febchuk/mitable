# Mitable

[![CI](https://github.com/Febchuk/mitable/workflows/CI/badge.svg)](https://github.com/Febchuk/mitable/actions/workflows/ci.yml)
[![Production Deploy](https://github.com/Febchuk/mitable/workflows/Production%20Deploy/badge.svg)](https://github.com/Febchuk/mitable/actions/workflows/production-deploy.yml)
[![Production Status](https://img.shields.io/badge/production-deployed-success)](https://mitablebackend-production.up.railway.app/health)

Desktop app that passively captures how you work and uses that data for time insights, update drafting, and team visibility.

## Quick Links

- **Production**: [https://mitablebackend-production.up.railway.app](https://mitablebackend-production.up.railway.app)
- **CI/CD Pipeline**: [GitHub Actions](https://github.com/Febchuk/mitable/actions)

## Project Structure

```
mitable/
├── apps/
│   ├── backend/              # Express API server
│   ├── electron/             # Electron desktop app (multi-window)
│   │   ├── src/
│   │   │   ├── main.ts       # Main process
│   │   │   ├── preload/      # Preload scripts
│   │   │   └── renderer/     # React apps for each window (single dev server)
│   │   │       └── console/  # Main workspace hub
│   │   ├── electron.vite.config.ts
│   │   └── tailwind.config.js
│   └── website/              # Next.js marketing + billing site
└── packages/
    └── shared/               # Shared types, Zod schemas, IPC channels
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
npm install
npm run build --workspace=packages/shared  # Required first
```

### Development

```bash
# Start all services (Backend API + Electron)
npm run dev

# Launch admin experience (Dashboard, People, Ask, Integrations)
npm run dev:admin

# Or run individual workspaces
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/electron
npm run dev:website  # Website on port 3003
```

### Building

```bash
npm run build
npm run build --workspace=apps/backend
npm run build --workspace=apps/electron
```

### Type Checking & Linting

```bash
npm run typecheck
npm run lint
npm run format
npm run format:check
```

## Architecture

### Multi-Window Electron Architecture

1. **Console Window** - Main workspace hub
   - **Employee Mode**: Calendar, Monitoring, Recaps, Docs, Artifacts
   - **Admin Mode**: Dashboard, People, Ask, Integrations, Setup
2. **WatchButton Window** - Floating trigger to start/stop capture
3. **WatchingPill Window** - Active monitoring indicator
4. **WatchingPillDropdown Window** - Dropdown from pill
5. **Overlay Window** - Fullscreen transparent layer
6. **Notification Window** - System notifications

All windows served from single dev server at `http://localhost:5173` via electron-vite.

### Tech Stack

- **Desktop**: Electron + React 18 + TypeScript + Tailwind CSS + electron-vite
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM
- **Website**: Next.js 15 + React 19 + Tailwind CSS v4 + Supabase Auth
- **Database**: PostgreSQL (Supabase) + Pinecone (vector embeddings)
- **AI**: Google Gemini 2.5 Flash (Vision), OpenAI embeddings, Groq (chat)
- **Payments**: Stripe
- **Monorepo**: npm workspaces + Turborepo

## Key Features

### Work Context Capture
Passively captures screenshots and activity (keyboard/mouse/clipboard, active window tracking) to build a picture of how you work.

### Time Insights
Surfaces how employees spend their time across apps, projects, and workstreams.

### Session Monitoring
Focused and passive work sessions with AI-powered classification and summarization.

### Update Drafting
AI-assisted drafting of work updates from captured session data.

### Admin Dashboard
Team-wide analytics: activity distribution, top apps, per-person breakdowns, and AI-powered Ask queries.

## Environment Variables

### Backend (apps/backend/.env)

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/mitable
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret
```

## Documentation

- **Product PRD**: `docs/mitable_productivity_prd.md`
- **Architecture Guide**: `docs/Electron_Express_monorepo_UPDATED.md`
- **Project Instructions**: `CLAUDE.md`

## License

Proprietary - Mitable Inc.
