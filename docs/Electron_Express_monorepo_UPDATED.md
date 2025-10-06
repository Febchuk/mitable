# Electron + Express Monorepo with electron-vite
## Multi-Window AI Assistant Architecture

A production-ready monorepo for **Node/Express + Electron + TypeScript + React + Tailwind** with **electron-vite** for unified multi-window development.

## Window Architecture Overview

### 1. **Agent Window** (Always-on-top floating widget)
- Quick access AI assistant - always visible
- Compact, draggable, transparent
- Dynamic click-through when not over UI

### 2. **Console Window** (Main workspace hub)
- Primary interface for conversations
- Tabbed interface: Conversations, Nudges, Settings
- Normal window behavior (minimize, hide, resize)

### 3. **Overlay Window** (Fullscreen visual feedback)
- Transparent full-screen layer for UI highlights
- Always click-through, never blocks interactions
- Shows guidance indicators and annotations

### 4. **Guide Window** (Step-by-step UI guidance)
- Side panel showing current step instructions
- Navigation controls (Previous/Next/Complete)
- Coordinates with Overlay for visual highlights

### 5. **Nudge Window** (Expert recommendations)
- Shows recommended people to reach out to
- Match scores and context
- Action buttons (Contact, Dismiss, Save)

---

## Directory Structure

```
mitable/
├── package.json              # npm workspaces + root scripts
├── turbo.json                # Turborepo config
├── apps/
│   ├── backend/              # Express API
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── routes.ts
│   │   └── package.json
│   └── electron/             # Electron app (5-window architecture)
│       ├── src/
│       │   ├── main.ts       # Main process - creates all 5 windows
│       │   ├── preload/      # Separate preload per window
│       │   │   ├── agent.ts
│       │   │   ├── console.ts
│       │   │   ├── overlay.ts
│       │   │   ├── guide.ts
│       │   │   └── nudge.ts
│       │   └── renderer/     # React apps per window (unified dev server)
│       │       ├── agent/
│       │       │   ├── index.html
│       │       │   └── src/
│       │       │       ├── agent.tsx
│       │       │       └── App.tsx
│       │       ├── console/
│       │       ├── overlay/
│       │       ├── guide/
│       │       ├── nudge/
│       │       └── styles.css # Shared Tailwind styles
│       ├── electron.vite.config.ts  # electron-vite config
│       ├── tailwind.config.js       # Shared Tailwind config
│       ├── postcss.config.js        # Shared PostCSS config
│       └── package.json
└── packages/
    └── shared/               # Shared types, Zod schemas, IPC channels
        ├── src/
        │   ├── index.ts
        │   ├── ipc.ts
        │   ├── types.ts
        │   ├── guides.ts
        │   └── nudges.ts
        └── package.json
```

---

## Configuration Files

### Root `package.json`

```json
{
  "name": "mitable",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.1.0"
  }
}
```

### Electron `package.json`

```json
{
  "name": "@mitable/electron",
  "version": "0.0.0",
  "type": "module",
  "main": "out/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@mitable/shared": "*",
    "electron": "^30.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.19",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.38",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.6.3",
    "vite": "^5.4.0"
  }
}
```

### `electron.vite.config.ts`

```typescript
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          agent: resolve(__dirname, "src/preload/agent.ts"),
          console: resolve(__dirname, "src/preload/console.ts"),
          overlay: resolve(__dirname, "src/preload/overlay.ts"),
          guide: resolve(__dirname, "src/preload/guide.ts"),
          nudge: resolve(__dirname, "src/preload/nudge.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          agent: resolve(__dirname, "src/renderer/agent/index.html"),
          console: resolve(__dirname, "src/renderer/console/index.html"),
          overlay: resolve(__dirname, "src/renderer/overlay/index.html"),
          guide: resolve(__dirname, "src/renderer/guide/index.html"),
          nudge: resolve(__dirname, "src/renderer/nudge/index.html"),
        },
      },
    },
  },
});
```

### Shared Tailwind Config

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{js,ts,jsx,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: {
          primary: "#000000",
          secondary: "#0a0a0a",
          tertiary: "#1a1a1a",
        },
        text: {
          primary: "#ffffff",
          secondary: "#a1a1aa",
          tertiary: "#71717a",
        },
        accent: {
          blue: { primary: "#3b82f6", hover: "#2563eb" },
        },
      },
    },
  },
  plugins: [],
};
```

---

## Main Process (`src/main.ts`)

```typescript
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import { join } from "path";

// Window references
let agentWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let guideWindow: BrowserWindow | null = null;
let nudgeWindow: BrowserWindow | null = null;

function createAgentWindow() {
  agentWindow = new BrowserWindow({
    width: 80,
    height: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/agent.mjs"),  // .mjs extension
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    agentWindow.setAlwaysOnTop(true, "modal-panel");
    agentWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    agentWindow.setAlwaysOnTop(true, "normal", 1);
  }

  // Environment detection using app.isPackaged
  if (!app.isPackaged) {
    agentWindow.loadURL("http://localhost:5173/agent");
  } else {
    agentWindow.loadFile(join(__dirname, "../renderer/agent.html"));
  }
}

// ... similar functions for other windows

// IPC Handlers
function setupIPC() {
  ipcMain.on("agent-show-console", () => {
    consoleWindow?.show();
  });

  ipcMain.on("guide-start", (_event, data) => {
    overlayWindow?.webContents.send("overlay-highlight-update", data);
    guideWindow?.webContents.send("guide-data", data);
    guideWindow?.show();
    if (nudgeWindow?.isVisible()) nudgeWindow.hide();
  });

  ipcMain.on("set-ignore-mouse-events", (_event, ignore: boolean) => {
    agentWindow?.setIgnoreMouseEvents(ignore, { forward: true });
    guideWindow?.setIgnoreMouseEvents(ignore, { forward: true });
    nudgeWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
}

app.whenReady().then(() => {
  createAgentWindow();
  createConsoleWindow();
  createOverlayWindow();
  createGuideWindow();
  createNudgeWindow();

  setupIPC();

  globalShortcut.register("CommandOrControl+H", () => {
    consoleWindow?.show();
    consoleWindow?.focus();
  });

  agentWindow?.show();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
```

**Key Points:**
- Use `app.isPackaged` instead of `process.env.NODE_ENV` for environment detection
- Preload paths reference `.mjs` files (electron-vite output format)
- Dev URLs point to `http://localhost:5173/{window}` (single dev server)
- Production paths use `../renderer/{window}.html`

---

## Preload Scripts

### `src/preload/agent.ts`

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentAPI", {
  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send("set-ignore-mouse-events", ignore);
  },

  showConsole: () => {
    ipcRenderer.send("agent-show-console");
  },
});

declare global {
  interface Window {
    agentAPI: {
      setIgnoreMouseEvents: (ignore: boolean) => void;
      showConsole: () => void;
    };
  }
}
```

---

## Renderer Structure

### `src/renderer/agent/index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/agent.tsx"></script>
  </body>
</html>
```

### `src/renderer/agent/src/agent.tsx`

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "../../styles.css";  // Shared styles

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `src/renderer/agent/src/App.tsx`

```typescript
import React, { useEffect, useRef } from "react";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic click-through
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const elements = containerRef.current.querySelectorAll(".pointer-events-auto");
      let isOverUI = false;

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          isOverUI = true;
        }
      });

      window.agentAPI?.setIgnoreMouseEvents(!isOverUI);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none">
      <button
        onClick={() => window.agentAPI?.showConsole()}
        className="absolute bottom-5 left-5 w-16 h-16 bg-indigo-600 rounded-full pointer-events-auto"
      >
        🤖
      </button>
    </div>
  );
}
```

### Shared Styles (`src/renderer/styles.css`)

```css
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  font-family: "Inter", sans-serif;
}

.app-drag {
  -webkit-app-region: drag;
}

.app-no-drag {
  -webkit-app-region: no-drag;
}
```

**Important**: `@import` must come **before** `@tailwind` directives.

---

## Development Workflow

### Setup

```bash
# Install all workspaces
npm install

# Build shared package first
npm run build --workspace=packages/shared
```

### Development

```bash
# Start all services (Backend API + Electron with unified dev server)
npm run dev
```

**What happens:**
1. Backend API starts on `http://localhost:3000`
2. electron-vite starts unified dev server on `http://localhost:5173`
3. Electron app launches with all 5 windows
4. All renderers have HMR (Hot Module Replacement) enabled

### Port Allocation

- Backend API: `http://localhost:3000`
- electron-vite dev server: `http://localhost:5173` (serves all renderers)
  - Agent: `http://localhost:5173/agent`
  - Console: `http://localhost:5173/console`
  - Overlay: `http://localhost:5173/overlay`
  - Guide: `http://localhost:5173/guide`
  - Nudge: `http://localhost:5173/nudge`

### Building

```bash
# Build all packages
npm run build

# Build specific workspace
npm run build --workspace=apps/electron
```

---

## Key Technical Patterns

### 1. Always-On-Top Windows (Cross-Platform)

**macOS** - Persists in fullscreen and across Mission Control:
```typescript
if (process.platform === "darwin") {
  window.setAlwaysOnTop(true, "modal-panel");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}
```

**Windows** - Use numeric z-order levels:
```typescript
else {
  window.setAlwaysOnTop(true, "normal", 1);
}
```

### 2. Dynamic Click-Through for Overlays

```typescript
// Renderer tracks mouse, tells main when to capture/pass-through
const handleMouseMove = (e: MouseEvent) => {
  const isOverUI = checkIfOverInteractiveElement(e);
  window.agentAPI.setIgnoreMouseEvents(!isOverUI);
};
```

### 3. Window Coordination via IPC

```typescript
// Main process acts as message broker between windows
ipcMain.on("guide-start", (_event, data) => {
  overlayWin.webContents.send("overlay-highlight-update", data);
  guideWin.webContents.send("guide-data", data);
  if (nudgeWin?.isVisible()) nudgeWin.hide();
});
```

### 4. Draggable Frameless Windows

```css
.app-drag { -webkit-app-region: drag; }      /* Header is draggable */
.app-no-drag { -webkit-app-region: no-drag; } /* Buttons/inputs are not */
```

---

## Architecture Benefits

✅ **Single Dev Server**: electron-vite serves all 5 renderers from one server
✅ **Unified HMR**: Hot reload works across all windows
✅ **Industry Standard**: Follows electron-vite best practices
✅ **Simpler Setup**: No environment variables needed
✅ **Faster Development**: Optimized bundling and module resolution
✅ **Better DX**: Hot reload for main + preload scripts
✅ **Proper Dependency Management**: electron-vite handles externalization
✅ **Shared Configuration**: Single Tailwind/PostCSS config

---

## Common Issues & Solutions

### Window ordering on macOS
Always reassert `setAlwaysOnTop` on `blur` event - macOS can sometimes drop the level.

### Click-through not working
Ensure `setIgnoreMouseEvents(true, { forward: true })` includes the `forward` option.

### Preload scripts not loading
Verify preload paths use `.mjs` extension (electron-vite output format), not `.js`.

### Environment detection not working
Use `app.isPackaged` instead of `process.env.NODE_ENV` - electron-vite doesn't set NODE_ENV automatically.

### CSS imports not working
Ensure `@import` statements come **before** `@tailwind` directives in styles.css.

### Multi-monitor overlays
Must create one overlay window per display using `screen.getAllDisplays()`.

---

## Migration from Multi-Server Setup

If migrating from a setup with 5 separate Vite servers (ports 5173-5177):

1. **Remove individual renderer configs**: Delete `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json` from each renderer subdirectory

2. **Update package.json**: Replace concurrently scripts with `electron-vite dev`

3. **Update main.ts**:
   - Change preload paths from `.js` to `.mjs`
   - Change environment detection to `app.isPackaged`
   - Update dev URLs to `http://localhost:5173/{window}`

4. **Consolidate configs**: Move Tailwind/PostCSS to root of electron app

5. **Update renderer entry points**: Ensure CSS imports use correct relative paths (`../../styles.css` from `{window}/src/*.tsx`)

---

This architecture provides a production-ready foundation for multi-window Electron applications with modern tooling and industry-standard practices.
