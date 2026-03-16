# Browser Bridge Implementation Plan

## Chrome Extension + WebSocket Bridge for Mitable Agent

**Date**: 2026-03-14
**Status**: v1 Core Plumbing Complete
**Goal**: Enable the Mitable AI agent to control the user's real Chrome browser (with their cookies, logins, sessions) via a Chrome Extension connected to Electron over WebSocket.

---

## Table of Contents

1. [Problem & Motivation](#1-problem--motivation)
2. [Why Chrome Extension + WebSocket](#2-why-chrome-extension--websocket)
3. [Architecture Overview](#3-architecture-overview)
4. [WebSocket Protocol Specification](#4-websocket-protocol-specification)
5. [Step 1: BrowserBridgeService (Electron)](#5-step-1-browserbridgeservice-electron)
6. [Step 2: IPC Channels & Main Process Wiring](#6-step-2-ipc-channels--main-process-wiring)
7. [Step 3: MCP Tools for the Agent](#7-step-3-mcp-tools-for-the-agent)
8. [Step 4: Chrome Extension](#8-step-4-chrome-extension)
9. [Step 5: HTTP Discovery (Auto-Discovery)](#9-step-5-http-discovery-auto-discovery)
10. [Security Model](#10-security-model)
11. [MV3 Service Worker Lifecycle](#11-mv3-service-worker-lifecycle)
12. [Files Changed Summary](#12-files-changed-summary)
13. [Development Workflow](#13-development-workflow)
14. [Verification & Testing](#14-verification--testing)
15. [Future Enhancements (v2)](#15-future-enhancements-v2)

---

## 1. Problem & Motivation

The Mitable agent captures how users work (screenshots, activity, app context) and can perform actions via Claude SDK tools (file ops, shell commands, Slack messages). However, **most knowledge work happens in the browser** — LinkedIn, Gmail, Slack web, Notion, internal dashboards, etc.

Currently, if the agent notices someone was browsing LinkedIn (from captured session data), it cannot act on that context by, say, searching LinkedIn on the user's behalf. The agent has no browser control capability.

### Why not just use CDP (Chrome DevTools Protocol)?

Chrome 136 (mid-2025) blocked connecting CDP to the user's default Chrome profile. `--remote-debugging-port` now requires `--user-data-dir` pointing to a non-default directory, which means a fresh profile with no cookies or logins. This breaks the core use case.

### Why not browser-use or Stagehand?

- **browser-use** is Python-only and uses CDP (same Chrome 136 limitation)
- **Stagehand** is TypeScript/Node.js but also uses CDP (same limitation)
- Neither can access the user's real logged-in browser session

### Why Chrome Extension?

A Chrome Extension runs **inside** the user's real browser with all their cookies, logins, and extensions. It is not affected by Chrome 136's CDP restrictions. Combined with a WebSocket connection to the Electron app, it creates a secure, fast communication channel.

---

## 2. Why Chrome Extension + WebSocket

| Requirement                | Chrome Extension + WS  | CDP Direct                 | Computer Use (Vision) |
| -------------------------- | ---------------------- | -------------------------- | --------------------- |
| Access user's real session | Yes                    | No (Chrome 136)            | Yes                   |
| Speed                      | ~10-50ms               | ~ms                        | ~2-10s/action         |
| DOM access                 | Full                   | Full                       | None                  |
| Setup friction             | Install extension once | Relaunch Chrome with flags | OS permissions        |
| Post-Chrome 136 compatible | Yes                    | Requires workarounds       | Yes                   |
| Cost per action            | Free                   | Free                       | LLM API costs         |

**Proven pattern**: 1Password, Bitwarden, NanoBrowser all use Chrome Extension + native app communication.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                 ELECTRON APP                        │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │ AgentView   │    │ agentSdkService          │   │
│  │ (Renderer)  │    │  - Claude SDK subprocess  │   │
│  └──────┬──────┘    │  - MCP tools:            │   │
│         │ IPC       │    browser_status         │   │
│         │           │    browser_navigate       │   │
│         │           │    browser_extract        │   │
│         │           │    browser_get_tabs       │   │
│  ┌──────┴──────┐    └──────────┬───────────────┘   │
│  │  main.ts    │               │ calls             │
│  │  IPC        │    ┌──────────┴───────────────┐   │
│  │  handlers   │    │ browserBridgeService     │   │
│  └─────────────┘    │  - HTTP + WebSocket SERVER│   │
│                     │  - Port: 19876 (fixed)    │   │
│                     │  - Auth: random token     │   │
│                     │  - GET /mitable-bridge/   │   │
│                     │    config → {token, name} │   │
│                     └──────────┬───────────────┘   │
└────────────────────────────────┼────────────────────┘
                                 │ WebSocket (localhost)
                                 │
┌────────────────────────────────┼────────────────────┐
│              CHROME EXTENSION                       │
│                                                     │
│  ┌─────────────────────────────┴──────────────┐    │
│  │ Service Worker (service-worker.ts)          │    │
│  │  - WebSocket CLIENT                        │    │
│  │  - Receives commands from Electron         │    │
│  │  - Routes to chrome.* APIs / content scripts│   │
│  │  - Sends responses back                    │    │
│  └──────────┬──────────────────────────────────┘   │
│             │ chrome.tabs.sendMessage()             │
│  ┌──────────┴──────────────────────────────────┐   │
│  │ Content Scripts (content-script.ts)          │   │
│  │  - Injected into every page                 │   │
│  │  - DOM read access (extract text, structure) │   │
│  │  - Keepalive pings to service worker        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ HTTP Discovery                                │   │
│  │  - fetch() to 127.0.0.1:19876-19880          │   │
│  │  - GET /mitable-bridge/config                │   │
│  │  - Returns {token, name} for WS auth         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Popup (popup.html/ts)                        │   │
│  │  - Shows connection status                   │   │
│  │  - Reconnect button                          │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Data Flow for a Browser Command

```
1. User: "What tabs do I have open?"
2. Agent (Claude SDK) decides to call browser_get_tabs MCP tool
3. agentSdkService calls browserBridgeService.sendCommand("get_tabs", {})
4. BrowserBridgeService sends WebSocket message:
   { id: "uuid-123", type: "request", action: "get_tabs", payload: {} }
5. Chrome Extension service worker receives message
6. Service worker calls chrome.tabs.query({})
7. Service worker sends response:
   { id: "uuid-123", type: "response", action: "get_tabs", success: true,
     payload: { tabs: [{ id: 1, url: "https://linkedin.com", title: "LinkedIn", active: true }, ...] } }
8. BrowserBridgeService resolves the Promise for id "uuid-123"
9. MCP tool returns result to agent
10. Agent formats response: "You have 5 tabs open: LinkedIn (active), Gmail, ..."
```

---

## 4. WebSocket Protocol Specification

### 4.1 Connection

- **Discovery**: Extension fetches `http://127.0.0.1:{port}/mitable-bridge/config` → `{ token, name: "mitable" }`
- **URL**: `ws://127.0.0.1:{port}?token={authToken}`
- **Port**: Fixed at 19876 (fallback range 19877–19880 if port in use)
- **Token**: 64-character hex string from `crypto.randomBytes(32)`. Regenerated each Electron launch.

### 4.2 Message Envelope

All messages are JSON strings:

```typescript
// Base message (both directions)
interface BridgeMessage {
  id: string; // UUID v4 for request/response correlation
  type: "request" | "response" | "event";
  action: string; // Command name
  payload: unknown; // Action-specific data
}

// Electron → Extension (command)
interface BridgeRequest extends BridgeMessage {
  type: "request";
  timeout?: number; // Optional override for response timeout (ms)
}

// Extension → Electron (command result)
interface BridgeResponse extends BridgeMessage {
  type: "response";
  success: boolean;
  error?: string; // Present when success === false
}

// Extension → Electron (unsolicited notification)
interface BridgeEvent extends BridgeMessage {
  type: "event";
  action: "connected" | "disconnected";
}
```

### 4.3 Actions (v1 — Core Infrastructure)

#### `ping` (Electron → Extension)

Keepalive. Sent every 20 seconds.

```
Request payload:  {}
Response payload: { pong: true, extensionVersion: string }
```

#### `get_tabs` (Electron → Extension)

List all open Chrome tabs.

```
Request payload:  {}
Response payload: {
  tabs: Array<{
    id: number;
    url: string;
    title: string;
    active: boolean;
    windowId: number;
  }>
}
```

#### `navigate` (Electron → Extension)

Navigate a tab to a URL.

```
Request payload:  {
  url: string;          // Full URL to navigate to
  tabId?: number;       // Target tab (omit = active tab)
  waitForLoad?: boolean; // Wait for page load complete (default: true)
}
Response payload: {
  url: string;          // Final URL after navigation (may differ due to redirects)
  title: string;        // Page title after load
  tabId: number;        // Tab that was navigated
}
```

#### `extract` (Electron → Extension)

Extract content from the current page.

```
Request payload:  {
  tabId?: number;       // Target tab (omit = active tab)
  selector?: string;    // CSS selector to extract from (omit = full page)
  mode?: "text" | "structured"; // Default: "text"
}

// mode: "text" response
Response payload: {
  content: string;      // Plain text content
  url: string;
  title: string;
}

// mode: "structured" response
Response payload: {
  content: {
    title: string;
    url: string;
    headings: string[];
    links: Array<{ text: string; href: string }>;
    text: string;       // Full page text (truncated to 10000 chars)
  }
}
```

### 4.4 Error Handling

When an action fails, the extension returns:

```json
{
  "id": "uuid-123",
  "type": "response",
  "action": "navigate",
  "success": false,
  "error": "Tab not found: 999",
  "payload": null
}
```

The MCP tool converts this to a text error for the agent:

```
Error: Tab not found: 999
```

### 4.5 Timeouts

Default timeout for `sendCommand()`: 30 seconds.
If no response arrives within the timeout, the pending Promise rejects with:

```
Error: Browser bridge command 'navigate' timed out after 30000ms
```

---

## 5. Step 1: BrowserBridgeService (Electron)

### File: `apps/electron/src/services/browserBridgeService.ts`

This is a new singleton service following the same pattern as `audioWebSocketService.ts`.

```typescript
/**
 * Browser Bridge Service
 *
 * WebSocket SERVER that connects to the Mitable Chrome Extension.
 * Enables the AI agent to control the user's browser via MCP tools.
 *
 * Discovery: Writes port + auth token to ~/.mitable/browser-bridge.json
 * so the Chrome Extension can auto-connect via Native Messaging.
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { randomBytes, randomUUID } from "crypto";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { createLogger } from "../lib/logger";

const logger = createLogger("BrowserBridge");

const CONFIG_DIR = join(app.getPath("home"), ".mitable");
const CONFIG_FILE = join(CONFIG_DIR, "browser-bridge.json");
const DEFAULT_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 20_000;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class BrowserBridgeService {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port = 0;
  private authToken = "";
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private _isConnected = false;

  /**
   * Start the WebSocket server and write discovery config file.
   */
  async start(): Promise<{ port: number; token: string }> {
    if (this.wss) {
      logger.warn("BrowserBridgeService already started");
      return { port: this.port, token: this.authToken };
    }

    // Generate auth token
    this.authToken = randomBytes(32).toString("hex");

    // Create WebSocket server on OS-assigned port
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        host: "127.0.0.1",
        port: 0, // OS assigns a free port
      });

      this.wss.on("listening", () => {
        const addr = this.wss!.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
        }

        // Write config file for extension discovery
        this.writeConfigFile();

        // Register native messaging host for Chrome extension auto-discovery
        this.registerNativeMessagingHost();

        logger.info(`Browser bridge listening on 127.0.0.1:${this.port}`);
        resolve({ port: this.port, token: this.authToken });
      });

      this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        this.handleConnection(ws, req);
      });

      this.wss.on("error", (err) => {
        logger.error("WebSocket server error:", err);
        reject(err);
      });
    });
  }

  /**
   * Stop the WebSocket server and clean up.
   */
  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error("Browser bridge shutting down"));
      clearTimeout(pending.timeout);
    }
    this.pendingRequests.clear();

    if (this.client) {
      this.client.close(1000, "Electron shutting down");
      this.client = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this._isConnected = false;

    // Remove config file
    this.removeConfigFile();

    logger.info("Browser bridge stopped");
  }

  /**
   * Send a command to the Chrome extension and await response.
   */
  async sendCommand<T = unknown>(
    action: string,
    payload: unknown,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    if (!this.client || !this._isConnected) {
      throw new Error(
        "Chrome extension not connected. The user needs to install the Mitable Chrome Extension."
      );
    }

    const id = randomUUID();
    const message = JSON.stringify({
      id,
      type: "request",
      action,
      payload,
    });

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Browser bridge command '${action}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      this.client!.send(message);
    });
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  getConnectionInfo(): { port: number; token: string; connected: boolean } {
    return {
      port: this.port,
      token: this.authToken,
      connected: this._isConnected,
    };
  }

  // --- Connection handler ---

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Validate auth token from query params
    const url = new URL(req.url || "", `http://127.0.0.1:${this.port}`);
    const token = url.searchParams.get("token");

    if (token !== this.authToken) {
      logger.warn("Rejected connection: invalid auth token");
      ws.close(4001, "Invalid auth token");
      return;
    }

    // Only allow one client at a time
    if (this.client) {
      logger.warn("Replacing existing extension connection");
      this.client.close(1000, "Replaced by new connection");
    }

    this.client = ws;
    this._isConnected = true;
    logger.info("Chrome extension connected");

    // Broadcast connection update to renderer (added in main.ts)
    this.onConnectionChange?.(true);

    // Start keepalive pings
    this.startPingInterval();

    ws.on("message", (data: Buffer) => {
      this.handleMessage(data);
    });

    ws.on("close", (code, reason) => {
      logger.info(`Chrome extension disconnected: ${code} ${reason}`);
      this.client = null;
      this._isConnected = false;
      this.stopPingInterval();
      this.onConnectionChange?.(false);
    });

    ws.on("error", (err) => {
      logger.error("Extension WebSocket error:", err);
    });
  }

  private handleMessage(data: Buffer): void {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "response" && msg.id) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);

          if (msg.success) {
            pending.resolve(msg.payload);
          } else {
            pending.reject(new Error(msg.error || "Unknown extension error"));
          }
        }
      } else if (msg.type === "event") {
        logger.info("Extension event:", { action: msg.action });
      }
    } catch (err) {
      logger.error("Failed to parse extension message:", err);
    }
  }

  // --- Keepalive ---

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(async () => {
      try {
        await this.sendCommand("ping", {}, 5000);
      } catch {
        logger.warn("Extension ping failed — may be disconnected");
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // --- Config file management ---

  private writeConfigFile(): void {
    try {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      }
      writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ port: this.port, token: this.authToken }, null, 2),
        { mode: 0o600 }
      );
      logger.info(`Config written to ${CONFIG_FILE}`);
    } catch (err) {
      logger.error("Failed to write config file:", err);
    }
  }

  private removeConfigFile(): void {
    try {
      if (existsSync(CONFIG_FILE)) {
        unlinkSync(CONFIG_FILE);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // --- Native Messaging Host Registration ---

  private registerNativeMessagingHost(): void {
    // Register the native messaging host manifest so the Chrome extension
    // can read the bridge config file automatically.
    // This is platform-specific — macOS implementation shown here.

    if (process.platform === "darwin") {
      const hostDir = join(
        app.getPath("home"),
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "NativeMessagingHosts"
      );

      const hostManifest = {
        name: "com.mitable.browser_bridge",
        description: "Mitable Browser Bridge - reads connection config",
        path: join(CONFIG_DIR, "native-messaging-host.js"),
        type: "stdio",
        allowed_origins: [
          // Will be updated with the actual extension ID after first install
          "chrome-extension://*/",
        ],
      };

      try {
        if (!existsSync(hostDir)) {
          mkdirSync(hostDir, { recursive: true });
        }
        writeFileSync(
          join(hostDir, "com.mitable.browser_bridge.json"),
          JSON.stringify(hostManifest, null, 2)
        );

        // Also write the native messaging host script
        this.writeNativeMessagingHostScript();

        logger.info("Native messaging host registered");
      } catch (err) {
        logger.error("Failed to register native messaging host:", err);
      }
    }
    // TODO: Windows (Registry) and Linux (~/.config/google-chrome/NativeMessagingHosts/)
  }

  private writeNativeMessagingHostScript(): void {
    const script = `#!/usr/bin/env node
// Native Messaging Host for Mitable Browser Bridge
// Reads the browser-bridge.json config and sends it to the Chrome extension

const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".mitable",
  "browser-bridge.json"
);

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

function readMessage() {
  return new Promise((resolve) => {
    let headerBuf = Buffer.alloc(0);
    const onData = (chunk) => {
      headerBuf = Buffer.concat([headerBuf, chunk]);
      if (headerBuf.length >= 4) {
        const len = headerBuf.readUInt32LE(0);
        const bodyBuf = headerBuf.slice(4);
        if (bodyBuf.length >= len) {
          process.stdin.removeListener("data", onData);
          resolve(JSON.parse(bodyBuf.slice(0, len).toString()));
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const request = await readMessage();

  if (request.action === "get_config") {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      sendMessage({ success: true, config });
    } catch (err) {
      sendMessage({ success: false, error: err.message });
    }
  } else {
    sendMessage({ success: false, error: "Unknown action" });
  }
}

main();
`;

    const scriptPath = join(CONFIG_DIR, "native-messaging-host.js");
    try {
      writeFileSync(scriptPath, script, { mode: 0o755 });
    } catch (err) {
      logger.error("Failed to write native messaging host script:", err);
    }
  }

  // --- Callback for connection state changes ---
  // Set by main.ts to broadcast to renderer
  onConnectionChange: ((connected: boolean) => void) | null = null;
}

export const browserBridgeService = new BrowserBridgeService();
```

### Key design decisions:

1. **Port 0**: Let the OS pick a free port. Avoids conflicts with other apps.
2. **Config file at `~/.mitable/`**: Standard location, same dir used for other Mitable config.
3. **Single client**: Only one extension connection allowed. Simplifies state management.
4. **Request/response correlation**: UUID-based. Allows multiple concurrent commands.
5. **Ping every 20s**: Keeps MV3 service worker alive (30s idle timeout).
6. **Native messaging host**: Written dynamically by `start()`, not a static file.

### Add dependency to `apps/electron/package.json`:

```json
"dependencies": {
  "ws": "^8.17.0"
},
"devDependencies": {
  "@types/ws": "^8.5.10"
}
```

Note: `ws` may already exist as a transitive dependency, but it should be explicit.

---

## 6. Step 2: IPC Channels & Main Process Wiring

### Modify: `packages/shared/src/ipc.ts`

Add 3 new channels to the `IPC_CHANNELS` object:

```typescript
// Browser Bridge (Chrome Extension communication)
BROWSER_BRIDGE_STATUS: "browser-bridge-status",
BROWSER_BRIDGE_GET_INFO: "browser-bridge-get-info",
BROWSER_BRIDGE_CONNECTION_UPDATE: "browser-bridge-connection-update",
```

### Modify: `apps/electron/src/main.ts`

Add to imports:

```typescript
import { browserBridgeService } from "./services/browserBridgeService";
```

In the app initialization (after `app.whenReady()`):

```typescript
// Start browser bridge WebSocket server
try {
  const bridgeInfo = await browserBridgeService.start();
  logger.info(`Browser bridge started on port ${bridgeInfo.port}`);

  // Broadcast connection state changes to console renderer
  browserBridgeService.onConnectionChange = (connected: boolean) => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.webContents.send(IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE, connected);
    }
  };
} catch (err) {
  logger.error("Failed to start browser bridge:", err);
}
```

Add IPC handlers (in a new `setupBrowserBridgeHandlers()` function):

```typescript
function setupBrowserBridgeHandlers() {
  ipcMain.handle(IPC_CHANNELS.BROWSER_BRIDGE_STATUS, () => {
    return browserBridgeService.isConnected();
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_BRIDGE_GET_INFO, () => {
    return browserBridgeService.getConnectionInfo();
  });
}
```

In `before-quit`:

```typescript
app.on("before-quit", async () => {
  // ... existing cleanup
  await browserBridgeService.stop();
});
```

### Modify: `apps/electron/src/preload/console.ts`

Add inline channel constants:

```typescript
BROWSER_BRIDGE_STATUS: "browser-bridge-status",
BROWSER_BRIDGE_GET_INFO: "browser-bridge-get-info",
BROWSER_BRIDGE_CONNECTION_UPDATE: "browser-bridge-connection-update",
```

Add preload API methods:

```typescript
getBrowserBridgeStatus: (): Promise<boolean> =>
  ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BRIDGE_STATUS),

getBrowserBridgeInfo: (): Promise<{
  port: number;
  token: string;
  connected: boolean;
}> => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BRIDGE_GET_INFO),

onBrowserBridgeConnectionUpdate: (
  callback: (connected: boolean) => void
) => {
  const handler = (_event: IpcRendererEvent, connected: boolean) =>
    callback(connected);
  ipcRenderer.on(IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE, handler);
  return () =>
    ipcRenderer.removeListener(
      IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE,
      handler
    );
},
```

### Modify: `apps/electron/src/renderer/console/src/global.d.ts`

Add type declarations:

```typescript
getBrowserBridgeStatus: () => Promise<boolean>;
getBrowserBridgeInfo: () => Promise<{
  port: number;
  token: string;
  connected: boolean;
}>;
onBrowserBridgeConnectionUpdate: (
  callback: (connected: boolean) => void
) => () => void;
```

---

## 7. Step 3: MCP Tools for the Agent

### Modify: `apps/electron/src/services/agentSdkService.ts`

Add 4 new MCP tools inside `createMitableToolsServer()`:

```typescript
// Import at top of file
import { browserBridgeService } from "./browserBridgeService";

// Inside createMitableToolsServer():

const browserStatusTool = tool(
  "browser_status",
  "Check if the Mitable Chrome Extension is connected and available for browser control. Use this before attempting any browser actions.",
  {},
  async () => {
    const info = browserBridgeService.getConnectionInfo();
    const text = info.connected
      ? "Chrome extension is connected and ready for browser actions."
      : "Chrome extension is not connected. Ask the user to install the Mitable Chrome Extension and ensure Chrome is running.";
    return { content: [{ type: "text" as const, text }] };
  }
);

const browserGetTabsTool = tool(
  "browser_get_tabs",
  "List all open tabs in the user's Chrome browser. Returns tab IDs, URLs, and titles. Use tab IDs with other browser tools to target specific tabs.",
  {},
  async () => {
    if (!browserBridgeService.isConnected()) {
      return {
        content: [{ type: "text" as const, text: "Error: Chrome extension not connected." }],
      };
    }
    try {
      const result = await browserBridgeService.sendCommand("get_tabs", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
    }
  }
);

const browserNavigateTool = tool(
  "browser_navigate",
  "Navigate the user's Chrome browser to a URL. Uses their real browser with cookies and logins. Omit tabId to use the active tab.",
  {
    url: z.string().describe("The URL to navigate to"),
    tabId: z.number().optional().describe("Tab ID to navigate (omit for active tab)"),
    waitForLoad: z.boolean().optional().describe("Wait for page load (default: true)"),
  },
  async ({ url, tabId, waitForLoad }) => {
    if (!browserBridgeService.isConnected()) {
      return {
        content: [{ type: "text" as const, text: "Error: Chrome extension not connected." }],
      };
    }
    try {
      const result = await browserBridgeService.sendCommand("navigate", {
        url,
        tabId,
        waitForLoad,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
    }
  }
);

const browserExtractTool = tool(
  "browser_extract",
  "Extract content from a Chrome browser tab. Returns page text, title, headings, and links. Use 'structured' mode for detailed page analysis. Omit tabId for the active tab.",
  {
    tabId: z.number().optional().describe("Tab ID (omit for active tab)"),
    selector: z.string().optional().describe("CSS selector to extract from (omit for full page)"),
    mode: z
      .enum(["text", "structured"])
      .optional()
      .describe(
        "Extraction mode: 'text' for plain text, 'structured' for title/headings/links/text (default: text)"
      ),
  },
  async ({ tabId, selector, mode }) => {
    if (!browserBridgeService.isConnected()) {
      return {
        content: [{ type: "text" as const, text: "Error: Chrome extension not connected." }],
      };
    }
    try {
      const result = await browserBridgeService.sendCommand("extract", {
        tabId,
        selector,
        mode,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err}` }] };
    }
  }
);
```

Update the MCP server creation:

```typescript
return createSdkMcpServer({
  name: "mitable",
  tools: [
    getMySessionsTool,
    getDailySummaryTool,
    slackChannelsTool,
    slackSendTool,
    browserStatusTool,
    browserGetTabsTool,
    browserNavigateTool,
    browserExtractTool,
  ],
});
```

Update tool arrays:

```typescript
// Phase 1: read-only tools (no mutations)
const READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "mcp__mitable__get_my_sessions",
  "mcp__mitable__get_daily_summary",
  "mcp__mitable__slack_list_channels",
  "mcp__mitable__browser_status",
  "mcp__mitable__browser_get_tabs",
  "mcp__mitable__browser_extract",
];

// Phase 2: all tools including write/mutate
const ALL_TOOLS = [
  ...READ_ONLY_TOOLS,
  "Write",
  "Edit",
  "Bash",
  "mcp__mitable__slack_send_message",
  "mcp__mitable__browser_navigate",
];
```

Update `buildSystemPrompt()`:

```typescript
// Add to capabilities list:
6. **Browser control**: View open tabs, read page content, and navigate in the user's Chrome browser (requires Mitable Chrome Extension)

// Add to rules:
- Before using browser tools, check browser_status first. If disconnected, tell the user to ensure Chrome is running with the Mitable extension installed
- browser_navigate changes the user's active tab — always confirm the URL before navigating
```

---

## 8. Step 4: Chrome Extension

### Directory Structure

```
apps/chrome-extension/
├── manifest.json
├── package.json
├── tsconfig.json
├── build.mjs
├── src/
│   ├── service-worker.ts
│   ├── content-script.ts
│   └── types.ts
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Mitable Browser Bridge",
  "version": "1.0.0",
  "description": "Connects your Chrome browser to the Mitable AI Agent",
  "permissions": ["activeTab", "tabs", "scripting", "nativeMessaging", "storage", "alarms"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "dist/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content-script.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### `package.json`

```json
{
  "name": "@mitable/chrome-extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "latest",
    "@anthropic-ai/claude-agent-sdk": "latest",
    "@anthropic-ai/claude-code": "latest",
    "@anthropic-ai/claude-code-sdk": "latest",
    "@anthropic-ai/tokenizer": "latest"
  }
}
```

Wait — the chrome extension has no AI dependencies. The devDependencies should just be build tools:

```json
{
  "name": "@mitable/chrome-extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "typescript": "^5.3.3",
    "@anthropic-ai/sdk": "latest"
  }
}
```

Actually, no — the extension doesn't use any Anthropic SDK either. Let me correct:

```json
{
  "name": "@mitable/chrome-extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "typescript": "^5.3.3",
    "@anthropic-ai/sdk": "latest"
  }
}
```

Simplified — just esbuild and typescript:

```json
{
  "name": "@mitable/chrome-extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "typescript": "^5.3.3"
  }
}
```

### `build.mjs`

```javascript
import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
};

const configs = [
  {
    ...buildOptions,
    entryPoints: ["src/service-worker.ts"],
    outfile: "dist/service-worker.js",
  },
  {
    ...buildOptions,
    entryPoints: ["src/content-script.ts"],
    outfile: "dist/content-script.js",
    format: "iife", // Content scripts must be IIFE, not ESM
  },
  {
    ...buildOptions,
    entryPoints: ["popup/popup.ts"],
    outfile: "popup/popup.built.js",
    format: "iife",
  },
];

if (isWatch) {
  for (const config of configs) {
    const ctx = await context(config);
    await ctx.watch();
  }
  console.log("Watching for changes...");
} else {
  for (const config of configs) {
    await build(config);
  }
  console.log("Build complete.");
}
```

### `src/types.ts`

```typescript
// Shared types for WebSocket protocol between Electron and Chrome Extension

export interface BridgeMessage {
  id: string;
  type: "request" | "response" | "event";
  action: string;
  payload: unknown;
}

export interface BridgeRequest extends BridgeMessage {
  type: "request";
  timeout?: number;
}

export interface BridgeResponse extends BridgeMessage {
  type: "response";
  success: boolean;
  error?: string;
}

export interface BridgeEvent extends BridgeMessage {
  type: "event";
}

// Action payloads
export interface NavigatePayload {
  url: string;
  tabId?: number;
  waitForLoad?: boolean;
}

export interface NavigateResult {
  url: string;
  title: string;
  tabId: number;
}

export interface ExtractPayload {
  tabId?: number;
  selector?: string;
  mode?: "text" | "structured";
}

export interface ExtractResult {
  content:
    | string
    | {
        title: string;
        url: string;
        headings: string[];
        links: Array<{ text: string; href: string }>;
        text: string;
      };
  url: string;
  title: string;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
}

export interface GetTabsResult {
  tabs: TabInfo[];
}
```

### `src/service-worker.ts`

```typescript
import type { BridgeRequest, BridgeResponse, NavigatePayload, ExtractPayload } from "./types";

// --- State ---
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;

// --- Startup ---

// Try to connect on install/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Mitable] Extension installed — attempting connection");
  fetchConfigAndConnect();
});

// Also try on service worker restart (MV3 can kill and restart the worker)
fetchConfigAndConnect();

// Keepalive alarm to prevent service worker idle termination
chrome.alarms.create("keepalive", { periodInMinutes: 0.4 }); // Every 24 seconds
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    // This wakes the service worker. If WS is dead, reconnect.
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      fetchConfigAndConnect();
    }
  }
});

// Handle keepalive pings from content scripts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "keepalive") {
    sendResponse({ alive: true, connected: ws?.readyState === WebSocket.OPEN });
    return true;
  }
});

// --- Native Messaging (read config file) ---

async function fetchConfigAndConnect(): Promise<void> {
  try {
    // First try storage cache
    const stored = await chrome.storage.local.get(["bridgePort", "bridgeToken"]);
    if (stored.bridgePort && stored.bridgeToken) {
      connect(stored.bridgePort, stored.bridgeToken);
    }

    // Then try native messaging for fresh config
    chrome.runtime.sendNativeMessage(
      "com.mitable.browser_bridge",
      { action: "get_config" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[Mitable] Native messaging error:", chrome.runtime.lastError.message);
          // Fall back to stored config (already tried above)
          return;
        }

        if (response?.success && response.config) {
          const { port, token } = response.config;
          // Cache in storage for when native messaging is unavailable
          chrome.storage.local.set({ bridgePort: port, bridgeToken: token });
          connect(port, token);
        }
      }
    );
  } catch (err) {
    console.error("[Mitable] Failed to fetch config:", err);
  }
}

// --- WebSocket Connection ---

function connect(port: number, token: string): void {
  // Don't reconnect if already connected
  if (ws && ws.readyState === WebSocket.OPEN) return;

  // Close stale connection
  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }

  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}/browser-bridge?token=${token}`);

    ws.onopen = () => {
      console.log("[Mitable] Connected to Electron");
      reconnectAttempts = 0;
      updateBadge(true);

      // Send connection event
      ws!.send(
        JSON.stringify({
          id: crypto.randomUUID(),
          type: "event",
          action: "connected",
          payload: { version: chrome.runtime.getManifest().version },
        })
      );
    };

    ws.onmessage = async (event) => {
      try {
        const msg: BridgeRequest = JSON.parse(event.data as string);
        if (msg.type === "request") {
          const response = await handleRequest(msg);
          ws?.send(JSON.stringify(response));
        }
      } catch (err) {
        console.error("[Mitable] Error handling message:", err);
      }
    };

    ws.onclose = (event) => {
      console.log(`[Mitable] Disconnected: ${event.code} ${event.reason}`);
      ws = null;
      updateBadge(false);

      // Reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
        console.log(`[Mitable] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
        setTimeout(() => fetchConfigAndConnect(), delay);
      }
    };

    ws.onerror = (err) => {
      console.error("[Mitable] WebSocket error:", err);
    };
  } catch (err) {
    console.error("[Mitable] Connection failed:", err);
  }
}

// --- Request Handlers ---

async function handleRequest(req: BridgeRequest): Promise<BridgeResponse> {
  const base: Omit<BridgeResponse, "success" | "payload" | "error"> = {
    id: req.id,
    type: "response",
    action: req.action,
  };

  try {
    switch (req.action) {
      case "ping":
        return {
          ...base,
          success: true,
          payload: { pong: true, version: chrome.runtime.getManifest().version },
        };

      case "get_tabs":
        return await handleGetTabs(base);

      case "navigate":
        return await handleNavigate(base, req.payload as NavigatePayload);

      case "extract":
        return await handleExtract(base, req.payload as ExtractPayload);

      default:
        return { ...base, success: false, error: `Unknown action: ${req.action}`, payload: null };
    }
  } catch (err) {
    return { ...base, success: false, error: String(err), payload: null };
  }
}

async function handleGetTabs(
  base: Omit<BridgeResponse, "success" | "payload" | "error">
): Promise<BridgeResponse> {
  const tabs = await chrome.tabs.query({});
  const tabList = tabs.map((t) => ({
    id: t.id!,
    url: t.url || "",
    title: t.title || "",
    active: t.active || false,
    windowId: t.windowId,
  }));
  return { ...base, success: true, payload: { tabs: tabList } };
}

async function handleNavigate(
  base: Omit<BridgeResponse, "success" | "payload" | "error">,
  payload: NavigatePayload
): Promise<BridgeResponse> {
  const { url, tabId, waitForLoad = true } = payload;

  // Get target tab
  let targetTabId: number;
  if (tabId) {
    targetTabId = tabId;
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      return { ...base, success: false, error: "No active tab found", payload: null };
    }
    targetTabId = activeTab.id;
  }

  if (waitForLoad) {
    // Navigate and wait for load complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Navigation timed out after 30s"));
      }, 30000);

      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === targetTabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.update(targetTabId, { url });
    });
  } else {
    await chrome.tabs.update(targetTabId, { url });
  }

  const tab = await chrome.tabs.get(targetTabId);
  return {
    ...base,
    success: true,
    payload: { url: tab.url, title: tab.title, tabId: targetTabId },
  };
}

async function handleExtract(
  base: Omit<BridgeResponse, "success" | "payload" | "error">,
  payload: ExtractPayload
): Promise<BridgeResponse> {
  const { tabId, selector, mode = "text" } = payload;

  // Get target tab
  let targetTabId: number;
  if (tabId) {
    targetTabId = tabId;
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      return { ...base, success: false, error: "No active tab found", payload: null };
    }
    targetTabId = activeTab.id;
  }

  // Send extraction request to content script
  const result = await chrome.tabs.sendMessage(targetTabId, {
    action: "dom_extract",
    selector,
    mode,
  });

  return { ...base, success: true, payload: result };
}

// --- Badge ---

function updateBadge(connected: boolean): void {
  chrome.action.setBadgeText({ text: connected ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({
    color: connected ? "#22C55E" : "#EF4444",
  });
}
```

### `src/content-script.ts`

```typescript
// Content script: runs in every page, handles DOM operations

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "dom_extract") {
    try {
      const result = extractContent(msg.selector, msg.mode || "text");
      sendResponse(result);
    } catch (err) {
      sendResponse({ error: String(err) });
    }
    return true; // Async response
  }
});

function extractContent(selector?: string, mode: "text" | "structured" = "text"): unknown {
  const target = selector ? document.querySelector(selector) : document.body;

  if (!target) {
    return { content: "", url: location.href, title: document.title };
  }

  if (mode === "structured") {
    // Extract structured page data
    const headings = Array.from(target.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
      (h) => h.textContent?.trim() || ""
    );

    const links = Array.from(target.querySelectorAll("a[href]"))
      .slice(0, 50) // Limit to 50 links
      .map((a) => ({
        text: a.textContent?.trim() || "",
        href: (a as HTMLAnchorElement).href,
      }));

    const text = (target.textContent || "").trim().slice(0, 10000); // Limit to 10k chars

    return {
      content: {
        title: document.title,
        url: location.href,
        headings,
        links,
        text,
      },
      url: location.href,
      title: document.title,
    };
  }

  // Plain text mode
  const text = (target.textContent || "").trim().slice(0, 10000);
  return { content: text, url: location.href, title: document.title };
}

// Keepalive: ping service worker every 25 seconds to prevent idle timeout
setInterval(() => {
  chrome.runtime.sendMessage({ action: "keepalive" }).catch(() => {
    // Service worker may be dead — alarm will restart it
  });
}, 25000);
```

### `popup/popup.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="../icons/icon-48.png" alt="Mitable" width="24" height="24" />
        <span class="title">Mitable Browser Bridge</span>
      </div>

      <div class="status">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Checking...</span>
      </div>

      <div class="info" id="info"></div>

      <button id="reconnectBtn" class="btn" style="display: none;">Reconnect</button>
    </div>

    <script src="popup.built.js"></script>
  </body>
</html>
```

### `popup/popup.ts`

```typescript
document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("statusDot")!;
  const statusText = document.getElementById("statusText")!;
  const infoDiv = document.getElementById("info")!;
  const reconnectBtn = document.getElementById("reconnectBtn")!;

  // Check connection status
  const response = await chrome.runtime.sendMessage({ action: "keepalive" });
  const connected = response?.connected || false;

  statusDot.className = `status-dot ${connected ? "connected" : "disconnected"}`;
  statusText.textContent = connected ? "Connected to Mitable" : "Disconnected";

  if (!connected) {
    reconnectBtn.style.display = "block";
    infoDiv.textContent = "Make sure the Mitable desktop app is running.";
  } else {
    const stored = await chrome.storage.local.get(["bridgePort"]);
    infoDiv.textContent = stored.bridgePort
      ? `Connected on port ${stored.bridgePort}`
      : "Connected";
  }

  reconnectBtn.addEventListener("click", () => {
    // Send message to service worker to reconnect
    chrome.runtime.sendMessage({ action: "reconnect" });
    window.close();
  });
});
```

### `popup/popup.css`

```css
body {
  width: 240px;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
}

.container {
  padding: 16px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background-color: #22c55e;
}

.status-dot.disconnected {
  background-color: #ef4444;
}

.info {
  color: #666;
  font-size: 12px;
  margin-bottom: 12px;
}

.btn {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 13px;
}

.btn:hover {
  background: #f5f5f5;
}
```

---

## 9. Step 5: HTTP Discovery (Auto-Discovery)

The extension discovers the bridge via a fixed-port HTTP endpoint. This replaced the original Native Messaging approach, which failed because Chrome's `allowed_origins` does not support wildcards — sideloaded dev extensions get different IDs each load.

### How it works:

1. **Electron** starts an HTTP + WebSocket server on port 19876 (fallback 19877–19880)
2. **Electron** serves `GET /mitable-bridge/config` → `{ token: "...", name: "mitable" }`
3. **Extension** service worker scans ports 19876–19880 via `fetch("http://127.0.0.1:{port}/mitable-bridge/config")`
4. **Extension** validates response has `name === "mitable"` and a `token` string
5. **Extension** connects WebSocket: `ws://127.0.0.1:{port}?token={token}`

### Why HTTP discovery instead of Native Messaging:

- **No Node.js on PATH needed** — native messaging host was a Node.js script
- **No host manifest registration** — native messaging required platform-specific manifest files
- **Works with any extension ID** — no `allowed_origins` restriction
- **Cross-platform by default** — no per-OS registry/path differences
- **Easier to debug** — `curl http://127.0.0.1:19876/mitable-bridge/config` just works

### Security:

- No CORS headers on the HTTP response → web pages cannot read the token
- Chrome extensions bypass CORS via `host_permissions: ["<all_urls>"]`
- Token is validated on WebSocket upgrade; invalid tokens get HTTP 401
- Server bound to `127.0.0.1` only — not reachable from network

---

## 10. Security Model

| Threat                                    | Mitigation                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Remote attacker connects to WS server     | Server binds to `127.0.0.1` only — not reachable from network                                                          |
| Local malware connects to WS server       | Auth token required (64-char random hex). Config file has `0600` permissions                                           |
| Token intercepted from config file        | File mode `0600` (owner read/write only). Token regenerated each Electron launch                                       |
| Extension reads sensitive page data       | Content scripts run in isolated world. Extracted data stays local (only sent to Electron, then to Anthropic via agent) |
| Agent navigates to malicious URL          | `browser_navigate` is Phase 2 (requires user plan approval before execution)                                           |
| Agent runs arbitrary JS on pages          | `browser_execute_script` intentionally NOT included in v1. Can be added later with explicit warnings                   |
| Man-in-the-middle on localhost WS         | WebSocket on localhost — no network traversal. Risk is negligible                                                      |
| Extension compromise via Chrome Web Store | For now, sideloaded only. Chrome Web Store distribution can be added later with proper review                          |

---

## 11. MV3 Service Worker Lifecycle

MV3 service workers terminate after ~30 seconds of inactivity. This is the primary technical challenge.

### Strategy:

1. **Chrome Alarms** (`chrome.alarms.create("keepalive", { periodInMinutes: 0.4 })`)
   - Fires every ~24 seconds, waking the service worker
   - Handler checks if WebSocket is alive, reconnects if not

2. **Content Script Pings** (every 25 seconds)
   - Content scripts call `chrome.runtime.sendMessage({ action: "keepalive" })`
   - This also wakes the service worker

3. **Electron Server Pings** (every 20 seconds)
   - Electron sends `ping` command over WebSocket
   - Incoming messages keep the service worker alive

4. **State Persistence** via `chrome.storage.local`
   - Port and token stored so reconnection doesn't require Native Messaging on every restart

### Worst case scenario:

If all keepalive mechanisms fail and the service worker dies:

1. The alarm fires within 24-30 seconds
2. The alarm handler calls `fetchConfigAndConnect()`
3. Native Messaging reads the config file
4. WebSocket reconnects
5. Total downtime: ~30 seconds max

---

## 12. Files Changed Summary

| Action     | File                                                 | Changes                                                                                |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Create** | `apps/electron/src/services/browserBridgeService.ts` | ~250 lines. WebSocket server, auth, config file, native messaging host registration    |
| **Create** | `apps/chrome-extension/manifest.json`                | Extension manifest (MV3)                                                               |
| **Create** | `apps/chrome-extension/package.json`                 | esbuild + typescript devDeps                                                           |
| **Create** | `apps/chrome-extension/tsconfig.json`                | TypeScript config for extension                                                        |
| **Create** | `apps/chrome-extension/build.mjs`                    | esbuild build script                                                                   |
| **Create** | `apps/chrome-extension/src/types.ts`                 | Shared WebSocket message types                                                         |
| **Create** | `apps/chrome-extension/src/service-worker.ts`        | ~200 lines. WS client, command handlers, keepalive                                     |
| **Create** | `apps/chrome-extension/src/content-script.ts`        | ~80 lines. DOM extraction, keepalive pings                                             |
| **Create** | `apps/chrome-extension/popup/popup.html`             | Connection status UI                                                                   |
| **Create** | `apps/chrome-extension/popup/popup.ts`               | Popup logic                                                                            |
| **Create** | `apps/chrome-extension/popup/popup.css`              | Popup styles                                                                           |
| **Create** | `apps/chrome-extension/icons/icon-*.png`             | Placeholder icons                                                                      |
| **Modify** | `apps/electron/package.json`                         | Add `ws`, `@types/ws` dependencies                                                     |
| **Modify** | `packages/shared/src/ipc.ts`                         | Add 3 IPC channels                                                                     |
| **Modify** | `apps/electron/src/main.ts`                          | Import + start/stop browserBridgeService, add IPC handlers, broadcast connection state |
| **Modify** | `apps/electron/src/preload/console.ts`               | Add 3 inline channel constants + 3 preload API methods                                 |
| **Modify** | `apps/electron/src/renderer/console/src/global.d.ts` | Add 3 type declarations                                                                |
| **Modify** | `apps/electron/src/services/agentSdkService.ts`      | Add 4 MCP tools, update tool arrays, update system prompt                              |

---

## 13. Development Workflow

### Building & Loading

```bash
# 1. Install ws dependency
cd apps/electron && npm install ws @types/ws

# 2. Build shared package (always first)
npm run build --workspace=packages/shared

# 3. Build chrome extension
cd apps/chrome-extension
npm install
npm run build

# 4. Load extension in Chrome
# Chrome → chrome://extensions → Developer mode → Load unpacked → select apps/chrome-extension/

# 5. Start Electron app
npm run dev
```

### Development Loop

```bash
# Terminal 1: Watch extension changes
cd apps/chrome-extension && npm run watch

# Terminal 2: Run Electron + backend
npm run dev

# After changing extension code:
# Chrome → chrome://extensions → Mitable Browser Bridge → Reload (circular arrow icon)
```

### Debugging

- **Extension service worker**: Chrome → `chrome://extensions` → Mitable Browser Bridge → "Service worker" link → opens DevTools
- **Content script**: Regular page DevTools → Console → filter by "content-script.ts"
- **BrowserBridgeService**: Electron logs at `~/Library/Logs/mitable/main.log`, grep for "BrowserBridge"
- **Agent MCP tools**: Look for `mcp__mitable__browser_*` in agent tool_use events

---

## 14. Verification & Testing

### Manual Testing Checklist

1. **Bridge starts**: Start Electron → check logs for "Browser bridge listening on 127.0.0.1:XXXXX"
2. **Config file written**: `cat ~/.mitable/browser-bridge.json` → should show `{ port, token }`
3. **Extension connects**: Load extension → popup shows "Connected to Mitable"
4. **Badge indicator**: Extension icon shows green "ON" badge when connected
5. **Get tabs**: In AgentView, type "What tabs do I have open?" → agent uses `browser_get_tabs` and lists tabs
6. **Navigate**: Type "Open google.com in Chrome" → agent proposes plan (Phase 2) → approve → Chrome navigates
7. **Extract**: Type "What's on the current page in my browser?" → agent uses `browser_extract` → returns page content
8. **Disconnection**: Quit Electron → extension popup shows "Disconnected", badge disappears
9. **Reconnection**: Restart Electron → extension auto-reconnects within ~30 seconds
10. **Typecheck**: `npm run typecheck` passes across all workspaces

### Unit Tests (future)

- `browserBridgeService.test.ts`: Mock WebSocket, test request/response correlation, timeouts, auth rejection
- Extension: Mock `chrome.*` APIs, test command handlers

---

## 15. Future Enhancements (v2)

After the core infrastructure is proven:

1. **`browser_click`** — Click element by CSS selector or text content
2. **`browser_type`** — Type text into form inputs
3. **`browser_screenshot`** — Capture visible tab as image (for vision analysis)
4. **`browser_execute_script`** — Run arbitrary JS (with strong safety warnings)
5. **`browser_wait`** — Wait for element to appear (useful for SPAs)
6. **UI indicators** — Connection status dot in AgentView, extension install flow
7. **Chrome Web Store distribution** — Publish extension for easy install
8. **Multi-browser support** — Firefox extension (WebExtensions API is cross-browser)
9. **Stagehand integration** — Use Stagehand for autonomous tasks that don't need user's session
10. **Session awareness** — When Mitable captures a work session, correlate browser tabs with captured context
