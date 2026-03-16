import { WebSocketServer, WebSocket } from "ws";
import { randomBytes, randomUUID } from "crypto";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { createLogger } from "../lib/logger";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";

const logger = createLogger("BrowserBridge");

const BRIDGE_PORT = 19876;
const BRIDGE_PORT_RANGE = 5;

// Config file location: ~/.mitable/browser-bridge.json
function getConfigDir(): string {
  return join(app.getPath("home"), ".mitable");
}

function getConfigPath(): string {
  return join(getConfigDir(), "browser-bridge.json");
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
  private httpServer: Server | null = null;
  private client: WebSocket | null = null;
  private token: string = "";
  private port: number = 0;
  private keepaliveInterval: NodeJS.Timeout | null = null;
  private pendingRequests: Map<
    string,
    { resolve: (value: BridgeResponse) => void; timer: NodeJS.Timeout }
  > = new Map();
  private connectionListeners: Set<ConnectionListener> = new Set();

  /** Start the HTTP + WebSocket server on a fixed port */
  async start(): Promise<void> {
    if (this.wss) {
      logger.warn("BrowserBridgeService already started");
      return;
    }

    // Generate auth token
    this.token = randomBytes(32).toString("hex");

    // Create HTTP server that serves the config endpoint
    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && req.url === "/mitable-bridge/config") {
        // No CORS headers — web pages can't read this; extensions bypass CORS via host_permissions
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: this.token, name: "mitable" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    // Create WebSocket server in noServer mode
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade → WebSocket
    this.httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url || "", `http://127.0.0.1:${this.port}`);
      const token = url.searchParams.get("token");

      if (token !== this.token) {
        logger.warn("Rejected WebSocket upgrade: invalid token");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit("connection", ws, req);
      });
    });

    // Try binding to ports in range
    this.port = await this.bindToPort();

    logger.info(`HTTP + WebSocket server listening on 127.0.0.1:${this.port}`);

    // Write config file (useful for debugging / CLI tools)
    this.writeConfigFile();

    // Handle WebSocket connections
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

  /** Try binding to ports BRIDGE_PORT through BRIDGE_PORT + BRIDGE_PORT_RANGE - 1 */
  private bindToPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      let attempt = 0;

      const tryNext = (): void => {
        if (attempt >= BRIDGE_PORT_RANGE) {
          reject(
            new Error(
              `Failed to bind to any port in range ${BRIDGE_PORT}-${BRIDGE_PORT + BRIDGE_PORT_RANGE - 1}`
            )
          );
          return;
        }

        const port = BRIDGE_PORT + attempt;
        attempt++;

        this.httpServer!.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            logger.warn(`Port ${port} in use, trying next...`);
            tryNext();
          } else {
            reject(err);
          }
        });

        this.httpServer!.listen(port, "127.0.0.1", () => {
          resolve(port);
        });
      };

      tryNext();
    });
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

    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
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
}

export const browserBridgeService = new BrowserBridgeService();
