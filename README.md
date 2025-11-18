# Mitable AI Onboarding Buddy

[![CI](https://github.com/Febchuk/mitable/workflows/CI/badge.svg)](https://github.com/Febchuk/mitable/actions/workflows/ci.yml)
[![Production Deploy](https://github.com/Febchuk/mitable/workflows/Production%20Deploy/badge.svg)](https://github.com/Febchuk/mitable/actions/workflows/production-deploy.yml)
[![Production Status](https://img.shields.io/badge/production-deployed-success)](https://mitablebackend-production.up.railway.app/health)

Your AI Onboarding Companion: Just-in-time contextual help meets intelligent workflow guidance.

## 🚀 Quick Links

- **Production**: [https://mitablebackend-production.up.railway.app](https://mitablebackend-production.up.railway.app)
- **CI/CD Pipeline**: [GitHub Actions](https://github.com/Febchuk/mitable/actions)
- **Contributing**: [CONTRIBUTING.md](docs/CONTRIBUTING.md)

## Project Structure

```
mitable/
├── apps/
│   ├── backend/              # Express API server
│   └── electron/             # Electron desktop app (5-window architecture)
│       ├── src/
│       │   ├── main.ts       # Main process
│       │   ├── preload/      # Preload scripts (agent, console, overlay, guide, nudge)
│       │   └── renderer/     # React apps for each window (single dev server)
│       │       ├── agent/    # Floating widget (Cmd+H)
│       │       ├── console/  # Main workspace hub
│       │       ├── overlay/  # Visual guidance overlay
│       │       ├── guide/    # Step-by-step guide panel
│       │       └── nudge/    # Expert recommendations panel
│       ├── electron.vite.config.ts  # electron-vite configuration
│       ├── tailwind.config.js       # Shared Tailwind config
│       └── postcss.config.js        # Shared PostCSS config
└── packages/
    └── shared/               # Shared types, Zod schemas, IPC channels
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Install all workspace dependencies
npm install

# Build shared package (required before running other workspaces)
npm run build --workspace=packages/shared
```

### Development

```bash
# Start all services (Backend API + Electron with unified dev server)
# Defaults to employee experience
npm run dev

# Launch admin experience (Dashboard, Integrations, Setup)
npm run dev:admin

# Launch employee experience (Home, Roadmap, Nudges, Chats)
npm run dev:employee

# Or run individual workspaces
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/electron
```

#### Console Modes

The console window supports two different user experiences:

- **Employee Mode** (default): Access to Home, Roadmap, Nudges, and Chats
- **Admin Mode**: Access to Dashboard (analytics), Integrations, and Setup

Use the `dev:admin` or `dev:employee` scripts to launch the appropriate experience. The mode is controlled via the `VITE_USER_ROLE` environment variable.

### Building

```bash
# Build all packages
npm run build

# Build specific workspace
npm run build --workspace=apps/backend
npm run build --workspace=apps/electron
```

### Type Checking

```bash
# Check all workspaces
npm run typecheck

# Check specific workspace
npm run typecheck --workspace=apps/backend
```

### Linting & Formatting

```bash
# Lint all workspaces
npm run lint

# Format all files
npm run format

# Check formatting without modifying files
npm run format:check
```

## Architecture

### Five-Window Electron Architecture

1. **Agent Window** - Always-on-top floating widget (Cmd+H)
2. **Console Window** - Main workspace with role-based navigation
   - **Employee Mode**: Home, Roadmap, Nudges, Chats
   - **Admin Mode**: Dashboard (analytics), Integrations, Setup
3. **Overlay Window** - Fullscreen transparent layer for visual guidance
4. **Guide Window** - Side panel for step-by-step UI guidance
5. **Nudge Window** - Expert recommendations panel

**All windows served from single dev server at `http://localhost:5173` via electron-vite**

### Tech Stack

- **Desktop**: Electron + React + TypeScript + Tailwind CSS + electron-vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 15 + pgvector (to be added)
- **AI**: Google Gemini 2.5 Flash + OpenAI embeddings (to be added)
- **Monorepo**: npm workspaces + Turborepo

## Environment Variables

### Backend (apps/backend/.env)

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/mitable
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=your_jwt_secret_here
```

### Electron

No environment variables needed - electron-vite handles dev server configuration automatically.

## Key Features

### 1. Just-in-Time Help System

- Press Cmd+H anywhere for contextual help
- AI analyzes your screen and provides step-by-step guidance
- Visual overlays with arrows pointing to UI elements

### 2. Visual Guidance Overlays

- Transparent fullscreen overlay with interactive highlights
- Arrow pointers with pulse animations
- Step-by-step instructions with progress tracking

### 3. Nudge System (Expert Matching)

- AI-powered expert recommendations
- Match scoring based on expertise, performance, and availability
- In-app notifications for expert connections

### 4. Roadmap System

- AI-generated week-by-week onboarding paths
- Role-specific templates
- Adaptive adjustment based on progress

### 5. Admin Dashboard

- **Dashboard**: Analytics and metrics (Total Savings, Regained Productivity, Top Nudge Themes, Time to Productivity)
- **Integrations**: Connect to Slack, Notion, Codebase, and other services
- **Setup**: Configuration and organization settings

## Global Shortcuts

- **Cmd+H (Ctrl+H)**: Open help console

## Development Workflow

1. **Make changes** to any workspace
2. **Run type checking**: `npm run typecheck`
3. **Run linting**: `npm run lint`
4. **Format code**: `npm run format`
5. **Test in dev mode**: `npm run dev`

## Documentation

- **Complete PRD**: `docs/mitable_complete_prd.md`
- **Architecture Guide**: `docs/Electron_Express_monorepo_UPDATED.md`
- **Project Instructions**: `CLAUDE.md`

## Current Status

✅ Monorepo setup complete
✅ TypeScript + ESLint + Prettier configured
✅ 5-window Electron architecture implemented
✅ Agent window with text/audio modes and conversation dialog
✅ Console window with role-based navigation
✅ Employee experience (Home, Roadmap, Nudges, Chats)
✅ Admin experience (Dashboard, Integrations, Setup)
✅ Guide window with step-by-step workflow
✅ Overlay window with visual highlights
✅ Nudge window with expert recommendations
✅ IPC channels and window coordination
✅ Shared types, schemas, and components

🚧 Next: Backend API and AI integration (Gemini Vision, OpenAI embeddings)

## License

Proprietary - Mitable Inc.
