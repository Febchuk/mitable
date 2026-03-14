import { WebSocketServer, WebSocket } from "ws";
import { randomBytes, randomUUID } from "crypto";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { createLogger } from "../lib/logger";
import type { IncomingMessage } from "http";

const logger = createLogger("BrowserBridge");

// Config file location: ~/.mitable/browser-bridge.json
function getConfigDir(): string {
  return join(app.getPath("home"), ".mitable");
}

function getConfigPath(): string {
  return join(getConfigDir(), "browser-bridge.json");
}

/** Native Messaging host manifest path (macOS) */
function getNativeMessagingHostDir(): string {
  if (process.platform === "darwin") {
    return join(
      app.getPath("home"),
      "Library/Application Support/Google/Chrome/NativeMessagingHosts"
    );
  }
  // Windows: HKEY_CURRENT_USER registry (not file-based, skip for now)
  // Linux: ~/.config/google-chrome/NativeMessagingHosts/
  return join(app.getPath("home"), ".config/google-chrome/NativeMessagingHosts");
}

// WebSocket protocol message types
export interface BridgeMessage {
  id: string;
  type: "request" | "response" | "event";
  action: string;
  payload: unknown;
}

export interface BridgeRequest extends BridgeMessage {
  type: "request";
}

export interface BridgeResponse extends BridgeMessage {
  type: "response";
  success: boolean;
  error?: string;
}

type ConnectionListener = (connected: boolean) => void;

class BrowserBridgeService {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private token: string = "";
  private port: number = 0;
  private keepaliveInterval: NodeJS.Timeout | null = null;
  private pendingRequests: Map<
    string,
    { resolve: (value: BridgeResponse) => void; timer: NodeJS.Timeout }
  > = new Map();
  private connectionListeners: Set<ConnectionListener> = new Set();

  /** Start the WebSocket server on a random port */
  async start(): Promise<void> {
    if (this.wss) {
      logger.warn("BrowserBridgeService already started");
      return;
    }

    // Generate auth token
    this.token = randomBytes(32).toString("hex");

    // Create WebSocket server on random port, bound to localhost only
    this.wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });

    await new Promise<void>((resolve) => {
      this.wss!.on("listening", () => {
        const addr = this.wss!.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
        }
        resolve();
      });
    });

    logger.info(`WebSocket server listening on 127.0.0.1:${this.port}`);

    // Write config file
    this.writeConfigFile();

    // Register native messaging host
    this.registerNativeMessagingHost();

    // Handle connections
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Start keepalive pings (keeps MV3 service worker alive)
    this.keepaliveInterval = setInterval(() => {
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        this.client.ping();
      }
    }, 20_000);
  }

  /** Stop the server and clean up */
  stop(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({
        id,
        type: "response",
        action: "error",
        payload: null,
        success: false,
        error: "Bridge shutting down",
      });
    }
    this.pendingRequests.clear();

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Delete config file
    try {
      unlinkSync(getConfigPath());
    } catch {
      // File may not exist
    }

    logger.info("BrowserBridgeService stopped");
  }

  /** Send a command to the extension and wait for response */
  async sendCommand(
    action: string,
    payload: unknown = {},
    timeoutMs: number = 15_000
  ): Promise<BridgeResponse> {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) {
      return {
        id: "",
        type: "response",
        action,
        payload: null,
        success: false,
        error: "Chrome extension not connected",
      };
    }

    const id = randomUUID();
    const request: BridgeRequest = { id, type: "request", action, payload };

    return new Promise<BridgeResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({
          id,
          type: "response",
          action,
          payload: null,
          success: false,
          error: `Request timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, timer });
      this.client!.send(JSON.stringify(request));
    });
  }

  /** Whether the Chrome extension is connected */
  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  /** Get connection info for IPC */
  getConnectionInfo(): { port: number; token: string; connected: boolean } {
    return {
      port: this.port,
      token: this.token,
      connected: this.isConnected(),
    };
  }

  /** Register a listener for connection state changes */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Validate auth token from query string
    const url = new URL(req.url || "", `http://127.0.0.1:${this.port}`);
    const token = url.searchParams.get("token");

    if (token !== this.token) {
      logger.warn("Rejected connection: invalid token");
      ws.close(4001, "Invalid token");
      return;
    }

    // Only allow one client at a time
    if (this.client) {
      logger.info("Replacing existing client connection");
      this.client.close(4002, "Replaced by new connection");
    }

    this.client = ws;
    logger.info("Chrome extension connected");
    this.notifyConnectionChange(true);

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as BridgeMessage;
        this.handleMessage(message);
      } catch (err) {
        logger.error("Failed to parse message from extension:", err);
      }
    });

    ws.on("close", () => {
      if (this.client === ws) {
        this.client = null;
        logger.info("Chrome extension disconnected");
        this.notifyConnectionChange(false);
      }
    });

    ws.on("error", (err) => {
      logger.error("WebSocket error:", err);
    });
  }

  private handleMessage(message: BridgeMessage): void {
    if (message.type === "response") {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        pending.resolve(message as BridgeResponse);
      }
    }
    // Events from extension (e.g., "connected" handshake) are logged
    else if (message.type === "event") {
      logger.info("Extension event:", message.action);
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(connected);
      } catch (err) {
        logger.error("Connection listener error:", err);
      }
    }
  }

  private writeConfigFile(): void {
    const configDir = getConfigDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const configPath = getConfigPath();
    const config = { port: this.port, token: this.token };
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    logger.info(`Config written to ${configPath}`);
  }

  private registerNativeMessagingHost(): void {
    try {
      const hostDir = getNativeMessagingHostDir();
      if (!existsSync(hostDir)) {
        mkdirSync(hostDir, { recursive: true });
      }

      // The native messaging host script reads ~/.mitable/browser-bridge.json
      // and returns its contents via stdout using the NM protocol
      const hostScriptPath = join(getConfigDir(), "native-messaging-host.js");

      // Write the host script
      const hostScript = `#!/usr/bin/env node
// Native Messaging host for Mitable Browser Bridge
// Reads ~/.mitable/browser-bridge.json and returns it to the Chrome extension
const fs = require("fs");
const path = require("path");
const os = require("os");

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

try {
  const configPath = path.join(os.homedir(), ".mitable", "browser-bridge.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  sendMessage(config);
} catch (err) {
  sendMessage({ error: err.message });
}
`;
      writeFileSync(hostScriptPath, hostScript, { mode: 0o755 });

      // Write the Native Messaging host manifest
      const manifestPath = join(hostDir, "com.mitable.browser_bridge.json");
      const manifest = {
        name: "com.mitable.browser_bridge",
        description: "Mitable Browser Bridge - provides WebSocket connection info",
        path: hostScriptPath,
        type: "stdio",
        // Allow any extension during development; restrict in production
        allowed_origins: [
          "chrome-extension://*/", // Allows any extension (dev sideload)
        ],
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      logger.info(`Native messaging host registered at ${manifestPath}`);
    } catch (err) {
      logger.error("Failed to register native messaging host:", err);
    }
  }
}

export const browserBridgeService = new BrowserBridgeService();
