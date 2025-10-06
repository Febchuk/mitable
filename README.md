# Mitable AI Onboarding Buddy

Your AI Onboarding Companion: Just-in-time contextual help meets intelligent workflow guidance.

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
npm run dev

# Or run individual workspaces
npm run dev --workspace=apps/backend
npm run dev --workspace=apps/electron
```

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

1. **Agent Window** - Always-on-top floating widget
2. **Console Window** - Main workspace with Roadmap/Nudges/Chats tabs
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
✅ 5-window Electron architecture scaffolded
✅ Basic React apps for all windows
✅ IPC channels defined
✅ Shared types and schemas

🚧 Next: Implement core help system with AI integration

## License

Proprietary - Mitable Inc.
