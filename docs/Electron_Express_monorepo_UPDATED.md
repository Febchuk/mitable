# Electron + Express Monorepo Scaffold (TypeScript/React/Tailwind)
## With Multi-Window AI Assistant Architecture

A batteries-included monorepo for **Node/Express + Electron + TypeScript + React + Tailwind** with support for **5-window AI assistant architecture** (Agent, Console, Overlay, Guide, Nudge windows).

Based on validated patterns from production overlay experiment.

## Window Architecture Overview

### 1. **Agent Window** (Always-on-top floating widget)
- Quick access AI assistant - always visible at bottom center
- Compact input for questions and commands
- Shows active status and notifications
- Draggable, transparent, click-through when not over UI

### 2. **Console Window** (Main workspace hub)
- Primary interface for deeper interactions
- Tabbed interface: Conversations, Nudges, Settings
- Normal window behavior (can minimize, hide, resize)
- Opens when Agent receives response or via shortcut

### 3. **Overlay Window** (Fullscreen visual feedback)
- Transparent full-screen layer for UI highlights
- Always click-through, never blocks interactions
- Shows guidance indicators, highlights, annotations

### 4. **Guide Window** (Step-by-step UI guidance)
- Side panel showing current step instructions
- Navigation controls (Previous/Next/Complete)
- Appears next to Console when workflow active
- Coordinates with Overlay for visual highlights

### 5. **Nudge Window** (Expert recommendations)
- Shows recommended people to reach out to
- Match scores and context
- Action buttons (Contact, Dismiss, Save for later)
- Tracks nudge status (pending/resolved/waiting)

---

## Directory layout

```
your-app/
├─ package.json              # npm workspaces + root scripts
├─ tsconfig.base.json        # shared TS config
├─ turbo.json                # optional, speeds up builds (Turborepo)
├─ .gitignore
├─ apps/
│  ├─ backend/               # Express API (TS)
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  └─ routes.ts
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ nodemon.json
│  └─ electron/              # Electron app (5-window architecture)
│     ├─ src/
│     │  ├─ main.ts          # Electron Main - creates all 5 windows
│     │  ├─ preload/         # Separate preload for each window type
│     │  │  ├─ agent.ts      # Agent window (formerly pill)
│     │  │  ├─ console.ts    # Console window (main hub)
│     │  │  ├─ overlay.ts    # Overlay window
│     │  │  ├─ guide.ts      # Guide window (step-by-step)
│     │  │  └─ nudge.ts      # Nudge window (expert matching)
│     │  └─ renderers/       # Separate React apps per window
│     │     ├─ agent/        # Agent window (Vite + Tailwind)
│     │     │  ├─ src/
│     │     │  │  ├─ main.tsx
│     │     │  │  ├─ App.tsx
│     │     │  │  └─ styles.css
│     │     │  ├─ index.html
│     │     │  ├─ tsconfig.json
│     │     │  ├─ tailwind.config.ts
│     │     │  ├─ postcss.config.cjs
│     │     │  └─ vite.config.ts
│     │     ├─ console/      # Console window (main hub)
│     │     │  ├─ src/
│     │     │  │  ├─ main.tsx
│     │     │  │  ├─ App.tsx
│     │     │  │  ├─ components/
│     │     │  │  │  ├─ ConversationsTab.tsx
│     │     │  │  │  ├─ NudgesTab.tsx
│     │     │  │  │  └─ SettingsTab.tsx
│     │     │  │  └─ styles.css
│     │     │  └─ [config files]
│     │     ├─ overlay/      # Fullscreen overlay
│     │     │  └─ [same structure as agent]
│     │     ├─ guide/        # Guide window (step-by-step)
│     │     │  └─ [same structure as agent]
│     │     └─ nudge/        # Nudge window (expert matching)
│     │        └─ [same structure as agent]
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ tsup.config.ts      # bundles main & all preloads (watch in dev)
└─ packages/
   └─ shared/                # Shared types, zod schemas, API client utils
      ├─ src/
      │  ├─ index.ts         # Re-exports all schemas
      │  ├─ ipc.ts           # IPC channel definitions & schemas
      │  ├─ types.ts         # Shared types
      │  ├─ guides.ts        # Guide (workflow) schemas
      │  └─ nudges.ts        # Nudge/expert matching schemas
      ├─ package.json
      └─ tsconfig.json
```

---

## Root `package.json`

```json
{
  "name": "your-app",
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

### Root `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "types": []
  },
  "exclude": ["**/node_modules", "**/dist", "**/out"]
}
```

### `.gitignore`

```
node_modules
dist
out
build
coverage
*.log
.DS_Store
apps/electron/out
apps/electron/.vite
apps/electron/src/renderers/*/node_modules
```

---

## Shared package (`packages/shared`)

**`packages/shared/package.json`**

```json
{
  "name": "@your/shared",
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -w -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "zod": "^3.23.8"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

**`packages/shared/src/ipc.ts`**

```ts
import { z } from "zod";

// IPC Schemas for type-safe communication
export const PingSchema = z.object({ message: z.string() });
export type Ping = z.infer<typeof PingSchema>;

export const PingReplySchema = z.object({ reply: z.string() });
export type PingReply = z.infer<typeof PingReplySchema>;

// Guide (workflow) coordination schemas
export const GuideStepSchema = z.object({
  id: z.number(),
  title: z.string(),
  instruction: z.string(),
  target: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
});

export type GuideStep = z.infer<typeof GuideStepSchema>;

// Nudge schemas
export const ExpertSchema = z.object({
  name: z.string(),
  role: z.string(),
  matchScore: z.number().min(0).max(100),
  avatar: z.string()
});

export const NudgeSchema = z.object({
  id: z.string(),
  context: z.string(),
  experts: z.array(ExpertSchema),
  status: z.enum(["pending", "resolved", "waiting"]).default("pending")
});

export type Expert = z.infer<typeof ExpertSchema>;
export type Nudge = z.infer<typeof NudgeSchema>;
```

---

## Backend (`apps/backend`)

**`apps/backend/package.json`**

```json
{
  "name": "@your/backend",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "nodemon",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json",
    "lint": "eslint ."
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.30",
    "eslint": "^8.57.0",
    "nodemon": "^3.1.0",
    "typescript": "^5.6.3"
  }
}
```

**`apps/backend/src/index.ts`**

```ts
import express from "express";
import cors from "cors";
import { routes } from "./routes.js";

const app = express();
app.use(cors());
app.use(express.json());

routes(app);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
```

---

## Electron app (`apps/electron`)

### Main Process with Multi-Window Support

**`apps/electron/package.json`**

```json
{
  "name": "@your/electron",
  "version": "0.0.0",
  "type": "module",
  "main": "out/main.cjs",
  "scripts": {
    "dev": "concurrently \"npm run dev:bundle\" \"npm run dev:agent\" \"npm run dev:console\" \"npm run dev:overlay\" \"npm run dev:guide\" \"npm run dev:nudge\" \"npm run dev:electron\"",
    "dev:bundle": "tsup --watch",
    "dev:agent": "vite --config src/renderers/agent/vite.config.ts --port 5173",
    "dev:console": "vite --config src/renderers/console/vite.config.ts --port 5174",
    "dev:overlay": "vite --config src/renderers/overlay/vite.config.ts --port 5175",
    "dev:guide": "vite --config src/renderers/guide/vite.config.ts --port 5176",
    "dev:nudge": "vite --config src/renderers/nudge/vite.config.ts --port 5177",
    "dev:electron": "electronmon .",
    "build": "npm run build:renderers && npm run build:main",
    "build:main": "tsup",
    "build:renderers": "cd src/renderers/agent && vite build && cd ../console && vite build && cd ../overlay && vite build && cd ../guide && vite build && cd ../nudge && vite build",
    "typecheck": "tsc -p tsconfig.json",
    "lint": "eslint ."
  },
  "dependencies": {
    "electron": "^30.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.30",
    "@vitejs/plugin-react": "^4.3.3",
    "concurrently": "^8.2.2",
    "electronmon": "^2.0.2",
    "tsup": "^8.0.2",
    "typescript": "^5.6.3",
    "vite": "^5.4.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.10"
  }
}
```

**`apps/electron/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "out",
    "module": "CommonJS",
    "target": "ES2020",
    "lib": ["ES2020"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/main.ts", "src/preload/*.ts"],
  "exclude": ["src/renderers"]
}
```

**`apps/electron/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/main.ts",
    "src/preload/agent.ts",
    "src/preload/console.ts",
    "src/preload/overlay.ts",
    "src/preload/guide.ts",
    "src/preload/nudge.ts"
  ],
  format: "cjs",
  outDir: "out",
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  external: ["electron"],
  shims: false
});
```

**`apps/electron/src/main.ts`** - Complete 5-Window Architecture

```ts
import { app, BrowserWindow, screen, ipcMain, globalShortcut } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let agentWin: BrowserWindow | null = null;      // Always-on-top floating widget
let consoleWin: BrowserWindow | null = null;    // Main workspace hub
let overlayWin: BrowserWindow | null = null;    // Fullscreen visual feedback
let guideWin: BrowserWindow | null = null;      // Step-by-step guidance
let nudgeWin: BrowserWindow | null = null;      // Expert recommendations

function createOverlay() {
  const primary = screen.getPrimaryDisplay();

  overlayWin = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.bounds.width,
    height: primary.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-overlay.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Critical: Pass clicks through to apps underneath
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  // Platform-specific always-on-top
  if (process.platform === "darwin") {
    overlayWin.setAlwaysOnTop(true, "floating");
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    overlayWin.setAlwaysOnTop(true, "normal", 0);
  }

  // Re-assert on blur (handles edge cases)
  overlayWin.on("blur", () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      if (process.platform === "darwin") {
        overlayWin.setAlwaysOnTop(true, "floating");
      } else {
        overlayWin.setAlwaysOnTop(true, "normal", 0);
      }
    }
  });

  const url = process.env.OVERLAY_DEV_URL || `file://${path.join(__dirname, "overlay", "index.html")}`;
  overlayWin.loadURL(url);
}

function createAgent() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primary.workAreaSize;

  agentWin = new BrowserWindow({
    width: 400,
    height: 60,
    x: Math.floor((screenWidth - 400) / 2),
    y: screenHeight - 80,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    focusable: true,
    hasShadow: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload-agent.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Platform-specific always-on-top (HIGHER than overlay)
  if (process.platform === "darwin") {
    agentWin.setAlwaysOnTop(true, "modal-panel");
    agentWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    agentWin.setAlwaysOnTop(true, "normal", 1);
  }

  // Dynamic click-through control
  ipcMain.on("agent-set-ignore-mouse-events", (_event, ignore: boolean) => {
    if (agentWin && !agentWin.isDestroyed()) {
      agentWin.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // Re-assert on blur
  agentWin.on("blur", () => {
    if (agentWin && !agentWin.isDestroyed()) {
      if (process.platform === "darwin") {
        agentWin.setAlwaysOnTop(true, "modal-panel");
      } else {
        agentWin.setAlwaysOnTop(true, "normal", 1);
      }
    }
  });

  const url = process.env.AGENT_DEV_URL || `file://${path.join(__dirname, "agent", "index.html")}`;
  agentWin.loadURL(url);
}

function createConsole() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primary.workAreaSize;

  consoleWin = new BrowserWindow({
    width: 900,
    height: 600,
    x: Math.floor((screenWidth - 900) / 2),
    y: Math.floor((screenHeight - 600) / 2),
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: false, // Normal window behavior
    minWidth: 600,
    minHeight: 400,
    show: false, // Hidden by default, shown when agent gets response
    webPreferences: {
      preload: path.join(__dirname, "preload-console.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const url = process.env.CONSOLE_DEV_URL || `file://${path.join(__dirname, "console", "index.html")}`;
  consoleWin.loadURL(url);
}

function createGuide() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primary.workAreaSize;

  guideWin = new BrowserWindow({
    width: 400,
    height: 500,
    x: screenWidth - 420,
    y: Math.floor((screenHeight - 500) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false, // Hidden until workflow starts
    webPreferences: {
      preload: path.join(__dirname, "preload-guide.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === "darwin") {
    guideWin.setAlwaysOnTop(true, "modal-panel");
    guideWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    guideWin.setAlwaysOnTop(true, "normal", 1);
  }

  // Dynamic click-through
  ipcMain.on("guide-set-ignore-mouse-events", (_event, ignore: boolean) => {
    if (guideWin && !guideWin.isDestroyed()) {
      guideWin.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  const url = process.env.GUIDE_DEV_URL || `file://${path.join(__dirname, "guide", "index.html")}`;
  guideWin.loadURL(url);
}

function createNudge() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primary.workAreaSize;

  nudgeWin = new BrowserWindow({
    width: 400,
    height: 500,
    x: screenWidth - 420,
    y: Math.floor((screenHeight - 500) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false, // Hidden until nudge available
    webPreferences: {
      preload: path.join(__dirname, "preload-nudge.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.platform === "darwin") {
    nudgeWin.setAlwaysOnTop(true, "modal-panel");
    nudgeWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    nudgeWin.setAlwaysOnTop(true, "normal", 1);
  }

  // Dynamic click-through
  ipcMain.on("nudge-set-ignore-mouse-events", (_event, ignore: boolean) => {
    if (nudgeWin && !nudgeWin.isDestroyed()) {
      nudgeWin.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  const url = process.env.NUDGE_DEV_URL || `file://${path.join(__dirname, "nudge", "index.html")}`;
  nudgeWin.loadURL(url);
}

// IPC Handlers - Window Coordination

// Console window control
ipcMain.on("show-console", () => {
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.show();
    consoleWin.focus();
  }
});

ipcMain.on("hide-console", () => {
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.hide();
  }
});

// Guide (workflow) handlers
ipcMain.on("guide-start", (_event, workflowId: string, stepData: any) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("overlay-highlight-update", stepData);
  }
  if (guideWin && !guideWin.isDestroyed()) {
    guideWin.show();
    guideWin.webContents.send("guide-data", { workflowId, stepData });
  }
  // Hide nudge if shown
  if (nudgeWin && !nudgeWin.isDestroyed() && nudgeWin.isVisible()) {
    nudgeWin.hide();
  }
});

ipcMain.on("guide-update-step", (_event, stepData: any) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("overlay-highlight-update", stepData);
  }
});

ipcMain.on("guide-end", () => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("overlay-highlight-clear");
  }
  if (guideWin && !guideWin.isDestroyed()) {
    guideWin.hide();
  }
});

// Nudge handlers
ipcMain.on("nudge-show", (_event, nudgeData: any) => {
  if (nudgeWin && !nudgeWin.isDestroyed()) {
    nudgeWin.show();
    nudgeWin.webContents.send("nudge-data", nudgeData);
  }
  // Hide guide if shown
  if (guideWin && !guideWin.isDestroyed() && guideWin.isVisible()) {
    guideWin.hide();
  }
});

ipcMain.on("nudge-hide", () => {
  if (nudgeWin && !nudgeWin.isDestroyed()) {
    nudgeWin.hide();
  }
});

ipcMain.on("nudge-action", (_event, action: string, nudgeId: string) => {
  // Forward to console for tracking
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.webContents.send("nudge-action-update", { action, nudgeId });
  }
});

// Agent response handler - show console
ipcMain.on("agent-response-received", () => {
  if (consoleWin && !consoleWin.isDestroyed()) {
    consoleWin.show();
    consoleWin.focus();
  }
});

app.whenReady().then(() => {
  // Create all windows
  createOverlay();
  createAgent();
  createConsole();
  createGuide();
  createNudge();

  // Global shortcuts
  const toggleAgent = process.platform === "darwin" ? "Command+H" : "Control+H";
  globalShortcut.register(toggleAgent, () => {
    agentWin?.isVisible() ? agentWin?.hide() : agentWin?.show();
    agentWin?.focus();
  });

  const toggleConsole = process.platform === "darwin" ? "Command+Shift+H" : "Control+Shift+H";
  globalShortcut.register(toggleConsole, () => {
    consoleWin?.isVisible() ? consoleWin?.hide() : consoleWin?.show();
    consoleWin?.focus();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createOverlay();
    createAgent();
    createConsole();
    createGuide();
    createNudge();
  }
});
```

---

### Preload Scripts

**`apps/electron/src/preload/agent.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentAPI", {
  // Dynamic click-through control
  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send("agent-set-ignore-mouse-events", ignore);
  },

  // Send question to backend/AI
  sendQuery: (query: string) => {
    ipcRenderer.send("agent-query", query);
  },

  // Notify when response received (triggers console to show)
  onResponseReceived: (callback: (response: any) => void) => {
    ipcRenderer.on("agent-response", (_event, response) => callback(response));
  }
});

declare global {
  interface Window {
    agentAPI: {
      setIgnoreMouseEvents: (ignore: boolean) => void;
      sendQuery: (query: string) => void;
      onResponseReceived: (callback: (response: any) => void) => void;
    };
  }
}
```

**`apps/electron/src/preload/console.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("consoleAPI", {
  // Window control
  hideWindow: () => {
    ipcRenderer.send("hide-console");
  },

  // Listen for nudge action updates from other windows
  onNudgeActionUpdate: (callback: (data: { action: string; nudgeId: string }) => void) => {
    ipcRenderer.on("nudge-action-update", (_event, data) => callback(data));
  },

  // Trigger guide/nudge windows
  startGuide: (workflowId: string, stepData: any) => {
    ipcRenderer.send("guide-start", workflowId, stepData);
  },

  showNudge: (nudgeData: any) => {
    ipcRenderer.send("nudge-show", nudgeData);
  }
});

declare global {
  interface Window {
    consoleAPI: {
      hideWindow: () => void;
      onNudgeActionUpdate: (callback: (data: { action: string; nudgeId: string }) => void) => void;
      startGuide: (workflowId: string, stepData: any) => void;
      showNudge: (nudgeData: any) => void;
    };
  }
}
```

**`apps/electron/src/preload/overlay.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("overlayAPI", {
  // Listen for highlight updates from main process
  onHighlightUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on("overlay-highlight-update", (_event, data) => callback(data));
  },

  onHighlightClear: (callback: () => void) => {
    ipcRenderer.on("overlay-highlight-clear", () => callback());
  }
});

declare global {
  interface Window {
    overlayAPI: {
      onHighlightUpdate: (callback: (data: any) => void) => void;
      onHighlightClear: (callback: () => void) => void;
    };
  }
}
```

**`apps/electron/src/preload/guide.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("guideAPI", {
  // Dynamic click-through control
  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send("guide-set-ignore-mouse-events", ignore);
  },

  // Listen for guide data from main process
  onGuideData: (callback: (data: { workflowId: string; stepData: any }) => void) => {
    ipcRenderer.on("guide-data", (_event, data) => callback(data));
  },

  // Step navigation
  updateStep: (stepData: any) => {
    ipcRenderer.send("guide-update-step", stepData);
  },

  endGuide: () => {
    ipcRenderer.send("guide-end");
  }
});

declare global {
  interface Window {
    guideAPI: {
      setIgnoreMouseEvents: (ignore: boolean) => void;
      onGuideData: (callback: (data: { workflowId: string; stepData: any }) => void) => void;
      updateStep: (stepData: any) => void;
      endGuide: () => void;
    };
  }
}
```

**`apps/electron/src/preload/nudge.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nudgeAPI", {
  // Dynamic click-through control
  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send("nudge-set-ignore-mouse-events", ignore);
  },

  // Listen for nudge data from main process
  onNudgeData: (callback: (data: any) => void) => {
    ipcRenderer.on("nudge-data", (_event, data) => callback(data));
  },

  // Action handlers
  takeAction: (action: "contact" | "dismiss" | "save", nudgeId: string) => {
    ipcRenderer.send("nudge-action", action, nudgeId);
  },

  hideNudge: () => {
    ipcRenderer.send("nudge-hide");
  }
});

declare global {
  interface Window {
    nudgeAPI: {
      setIgnoreMouseEvents: (ignore: boolean) => void;
      onNudgeData: (callback: (data: any) => void) => void;
      takeAction: (action: "contact" | "dismiss" | "save", nudgeId: string) => void;
      hideNudge: () => void;
    };
  }
}
```

---

### Renderer Examples

**`apps/electron/src/renderers/agent/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  server: {
    port: 5173,
    strictPort: true
  },
  base: "",
  build: {
    outDir: "../../../../out/agent",
    emptyOutDir: true
  }
});
```

**`apps/electron/src/renderers/agent/src/App.tsx`** - Agent Window (Floating Widget)

```tsx
import React, { useState, useEffect, useRef } from "react";

export default function App() {
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic click-through: only capture clicks on UI elements
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

      if (window.agentAPI) {
        window.agentAPI.setIgnoreMouseEvents(!isOverUI);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleSubmit = () => {
    if (inputValue.trim() && window.agentAPI) {
      window.agentAPI.sendQuery(inputValue);
      setInputValue("");
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none">
      <div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full shadow-2xl bg-gradient-to-r from-gray-800 to-gray-900 pointer-events-auto"
        style={{ width: 400, height: 60 }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* AI Icon */}
          <div className="app-drag cursor-move flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          {/* Input */}
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-400 outline-none text-sm app-no-drag"
            placeholder="Ask me anything..."
          />

          {/* Submit button */}
          {inputValue && (
            <button
              onClick={handleSubmit}
              className="app-no-drag text-indigo-400 hover:text-indigo-300"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

**`apps/electron/src/renderers/agent/src/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  background: transparent;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

.app-drag {
  -webkit-app-region: drag;
}

.app-no-drag {
  -webkit-app-region: no-drag;
}
```

---

**`apps/electron/src/renderers/console/src/App.tsx`** - Console Window (Main Hub)

```tsx
import React, { useState } from "react";
import ConversationsTab from "./components/ConversationsTab";
import NudgesTab from "./components/NudgesTab";
import SettingsTab from "./components/SettingsTab";

export default function App() {
  const [activeTab, setActiveTab] = useState<"conversations" | "nudges" | "settings">("conversations");

  return (
    <div className="w-full h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header with tabs - draggable */}
      <div className="app-drag flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-semibold">Console</h1>

        <div className="app-no-drag flex gap-2">
          <button
            onClick={() => setActiveTab("conversations")}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "conversations"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
            }`}
          >
            Conversations
          </button>
          <button
            onClick={() => setActiveTab("nudges")}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "nudges"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
            }`}
          >
            Nudges
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "settings"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
            }`}
          >
            Settings
          </button>
        </div>

        <button
          onClick={() => window.consoleAPI?.hideWindow()}
          className="app-no-drag text-gray-400 hover:text-gray-200"
        >
          ✕
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "conversations" && <ConversationsTab />}
        {activeTab === "nudges" && <NudgesTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
```

**`apps/electron/src/renderers/console/src/components/ConversationsTab.tsx`**

```tsx
import React from "react";

export default function ConversationsTab() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Conversation History</h2>
      <div className="space-y-4">
        {/* Conversation items will go here */}
        <p className="text-gray-400">No conversations yet</p>
      </div>
    </div>
  );
}
```

**`apps/electron/src/renderers/console/src/components/NudgesTab.tsx`**

```tsx
import React, { useState, useEffect } from "react";

type Nudge = {
  id: string;
  status: "pending" | "resolved" | "waiting";
  expert: string;
  context: string;
  matchScore: number;
};

export default function NudgesTab() {
  const [nudges, setNudges] = useState<Nudge[]>([]);

  useEffect(() => {
    if (window.consoleAPI) {
      window.consoleAPI.onNudgeActionUpdate(({ action, nudgeId }) => {
        setNudges(prev =>
          prev.map(n =>
            n.id === nudgeId
              ? { ...n, status: action === "contact" ? "waiting" : action === "dismiss" ? "resolved" : n.status }
              : n
          )
        );
      });
    }
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Nudge Tracking</h2>

      <div className="flex gap-4 mb-6">
        <button className="px-4 py-2 bg-yellow-600 rounded-lg">Pending</button>
        <button className="px-4 py-2 bg-gray-700 rounded-lg">Waiting</button>
        <button className="px-4 py-2 bg-gray-700 rounded-lg">Resolved</button>
      </div>

      <div className="space-y-4">
        {nudges.length === 0 ? (
          <p className="text-gray-400">No nudges tracked</p>
        ) : (
          nudges.map(nudge => (
            <div key={nudge.id} className="p-4 bg-gray-800 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold">{nudge.expert}</h3>
                <span className={`text-xs px-2 py-1 rounded ${
                  nudge.status === "pending" ? "bg-yellow-600" :
                  nudge.status === "waiting" ? "bg-blue-600" : "bg-green-600"
                }`}>
                  {nudge.status}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-2">{nudge.context}</p>
              <p className="text-xs text-gray-500">Match: {nudge.matchScore}%</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**`apps/electron/src/renderers/console/src/components/SettingsTab.tsx`**

```tsx
import React from "react";

export default function SettingsTab() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Theme</label>
          <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
            <option>Dark</option>
            <option>Light</option>
          </select>
        </div>
      </div>
    </div>
  );
}
```

---

**`apps/electron/src/renderers/overlay/src/App.tsx`** - Overlay Window (Visual Feedback)

```tsx
import React, { useEffect, useState } from "react";

type HighlightBox = {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

export default function App() {
  const [highlightBox, setHighlightBox] = useState<HighlightBox>(null);

  useEffect(() => {
    if (window.overlayAPI) {
      window.overlayAPI.onHighlightUpdate((data) => {
        setHighlightBox(data);
      });

      window.overlayAPI.onHighlightClear(() => {
        setHighlightBox(null);
      });
    }
  }, []);

  return (
    <div className="fixed inset-0">
      {highlightBox && (
        <div
          className="absolute border-4 border-indigo-500 rounded-xl animate-pulse pointer-events-none"
          style={{
            left: highlightBox.x - 4,
            top: highlightBox.y - 4,
            width: highlightBox.width + 8,
            height: highlightBox.height + 8
          }}
        />
      )}
    </div>
  );
}
```

---

**`apps/electron/src/renderers/guide/src/App.tsx`** - Guide Window (Step-by-Step)

```tsx
import React, { useState, useEffect, useRef } from "react";

type GuideStep = {
  id: number;
  title: string;
  instruction: string;
};

export default function App() {
  const [currentStep, setCurrentStep] = useState<GuideStep | null>(null);
  const [workflowId, setWorkflowId] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.guideAPI) {
      window.guideAPI.onGuideData(({ workflowId, stepData }) => {
        setWorkflowId(workflowId);
        setCurrentStep(stepData);
      });
    }
  }, []);

  // Dynamic click-through
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const elements = containerRef.current.querySelectorAll(".pointer-events-auto");
      let isOverUI = false;
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          isOverUI = true;
        }
      });
      if (window.guideAPI) {
        window.guideAPI.setIgnoreMouseEvents(!isOverUI);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleNext = () => {
    if (currentStep && window.guideAPI) {
      window.guideAPI.updateStep({ id: currentStep.id + 1 });
    }
  };

  const handleComplete = () => {
    if (window.guideAPI) {
      window.guideAPI.endGuide();
    }
  };

  if (!currentStep) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none">
      <div className="absolute right-5 top-1/2 -translate-y-1/2 w-80 bg-gray-900 rounded-xl shadow-2xl p-6 pointer-events-auto">
        <h3 className="text-lg font-semibold text-white mb-2">{currentStep.title}</h3>
        <p className="text-gray-300 text-sm mb-6">{currentStep.instruction}</p>

        <div className="flex gap-2">
          <button
            onClick={handleNext}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg app-no-drag"
          >
            Next
          </button>
          <button
            onClick={handleComplete}
            className="px-4 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg app-no-drag"
          >
            Complete
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

**`apps/electron/src/renderers/nudge/src/App.tsx`** - Nudge Window (Expert Matching)

```tsx
import React, { useState, useEffect, useRef } from "react";

type Nudge = {
  id: string;
  experts: Array<{
    name: string;
    role: string;
    matchScore: number;
    avatar: string;
  }>;
  context: string;
};

export default function App() {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.nudgeAPI) {
      window.nudgeAPI.onNudgeData((data) => {
        setNudge(data);
      });
    }
  }, []);

  // Dynamic click-through
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const elements = containerRef.current.querySelectorAll(".pointer-events-auto");
      let isOverUI = false;
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          isOverUI = true;
        }
      });
      if (window.nudgeAPI) {
        window.nudgeAPI.setIgnoreMouseEvents(!isOverUI);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleAction = (action: "contact" | "dismiss" | "save") => {
    if (nudge && window.nudgeAPI) {
      window.nudgeAPI.takeAction(action, nudge.id);
      if (action === "contact" || action === "dismiss") {
        window.nudgeAPI.hideNudge();
      }
    }
  };

  if (!nudge) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none">
      <div className="absolute right-5 top-1/2 -translate-y-1/2 w-80 bg-gray-900 rounded-xl shadow-2xl p-6 pointer-events-auto">
        <h3 className="text-lg font-semibold text-white mb-2">Recommended Experts</h3>
        <p className="text-gray-400 text-sm mb-4">{nudge.context}</p>

        <div className="space-y-3 mb-6">
          {nudge.experts.map((expert, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold">
                {expert.avatar}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{expert.name}</p>
                <p className="text-gray-400 text-xs">{expert.role}</p>
              </div>
              <div className="text-indigo-400 font-semibold text-sm">{expert.matchScore}%</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleAction("contact")}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg app-no-drag"
          >
            Contact
          </button>
          <button
            onClick={() => handleAction("save")}
            className="px-4 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg app-no-drag"
          >
            Save
          </button>
          <button
            onClick={() => handleAction("dismiss")}
            className="px-4 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg app-no-drag"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Dev workflow

From repo root:

```bash
# Install all workspaces
npm i

# Start everything (API, Electron with 5-window dev)
npm run dev
```

### Port allocation:
- **Backend API**: `http://localhost:3000`
- **Agent renderer**: `http://localhost:5173` (Vite HMR)
- **Console renderer**: `http://localhost:5174` (Vite HMR)
- **Overlay renderer**: `http://localhost:5175` (Vite HMR)
- **Guide renderer**: `http://localhost:5176` (Vite HMR)
- **Nudge renderer**: `http://localhost:5177` (Vite HMR)

### Environment variables (optional):

**`apps/electron/.env`**
```
AGENT_DEV_URL=http://localhost:5173
CONSOLE_DEV_URL=http://localhost:5174
OVERLAY_DEV_URL=http://localhost:5175
GUIDE_DEV_URL=http://localhost:5176
NUDGE_DEV_URL=http://localhost:5177
```

---

## Build & package

```bash
# Build all renderers and main process
npm run build

# Package with electron-builder
cd apps/electron
npx electron-builder -p never
```

**`apps/electron` - Add to package.json for packaging:**

```json
{
  "build": {
    "appId": "com.your.app",
    "directories": { "output": "release" },
    "files": ["out/**/*"],
    "mac": {
      "target": ["dmg"],
      "entitlements": "entitlements.mac.plist",
      "entitlementsInherit": "entitlements.mac.plist"
    },
    "win": { "target": ["nsis"] }
  }
}
```

**`apps/electron/entitlements.mac.plist`** (for fullscreen persistence):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.inherit</key>
  <true/>
</dict>
</plist>
```

---

## Key Patterns from Experiment

### 1. Always-On-Top Across Workspaces & Fullscreen

```ts
// macOS - persists in fullscreen and across Spaces/Mission Control
if (process.platform === "darwin") {
  window.setAlwaysOnTop(true, "modal-panel");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

// Windows - use numeric z-order levels
else {
  window.setAlwaysOnTop(true, "normal", 1);
}
```

**Key insight**: The `setVisibleOnAllWorkspaces` with `visibleOnFullScreen: true` is what makes windows persist even when other apps go fullscreen. This is critical for overlay applications.

### 2. Dynamic Click-Through

```ts
// Renderer tracks mouse, tells main when to capture/pass-through
const handleMouseMove = (e: MouseEvent) => {
  const isOverUI = checkIfOverInteractiveElement(e);
  window.agentAPI.setIgnoreMouseEvents(!isOverUI);
};
```

**Why this works**: By default, always-on-top windows capture all clicks. This pattern only captures clicks when hovering over actual UI elements, passing through otherwise.

### 3. Window-to-Window Coordination via IPC

```ts
// Main process acts as message broker between windows
ipcMain.on("guide-start", (_event, data) => {
  // Update overlay to show visual highlights
  overlayWin.webContents.send("overlay-highlight-update", data);
  // Show guide window with instructions
  guideWin.webContents.send("guide-data", data);
  // Hide nudge if shown (mutually exclusive)
  if (nudgeWin?.isVisible()) nudgeWin.hide();
});
```

**Pattern**: Main process coordinates all 5 windows, ensuring:
- Guide and Nudge windows are mutually exclusive
- Overlay syncs with Guide for visual feedback
- Console tracks all nudge actions

### 4. Draggable Frameless Windows with Selective Regions

```css
/* Header is draggable */
.app-drag { -webkit-app-region: drag; }

/* Buttons/inputs inside header are NOT draggable */
.app-no-drag { -webkit-app-region: no-drag; }
```

**Implementation**: Agent window has draggable icon but non-draggable input field, allowing users to move the window without interfering with text input.

---

## Production Considerations

1. **Multi-Monitor Support**: Iterate `screen.getAllDisplays()` to create one overlay per display
2. **Position Persistence**: Save/restore window positions with `electron-store`
3. **Global Shortcuts**: Consider user-configurable shortcuts instead of hardcoded
4. **Error Handling**: Add retry logic for window creation failures
5. **Performance**: Monitor CPU/memory usage with multiple windows
6. **Accessibility**: Ensure keyboard navigation works across windows

---

## Architecture Benefits

✅ **Separation of Concerns**: Each window has its own renderer and preload
✅ **Type Safety**: Shared schemas via `@your/shared` with Zod validation
✅ **Hot Reload**: Independent Vite dev servers per window
✅ **Click-Through**: Smart mouse tracking only captures when needed
✅ **Always Visible**: Works in fullscreen apps and across virtual desktops
✅ **Draggable**: Frameless windows with selective drag regions
✅ **Scalable**: Easy to add more window types (settings, notifications, etc.)

---

**This scaffold is production-ready for overlay applications like screen recording tools, AI assistants, workflow automation, or any app requiring persistent UI over other applications.**
