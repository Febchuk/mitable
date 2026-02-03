/**
 * Socket Service
 *
 * Manages WebSocket connections using Socket.IO for real-time updates.
 * Used by workstream RLM service to broadcast workstream changes.
 */

import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../lib/logger.js";

/**
 * Socket events for workstream updates
 */
export const SOCKET_EVENTS = {
  // Client events (client -> server)
  JOIN_SESSION: "session:join",
  LEAVE_SESSION: "session:leave",

  // Server events (server -> client)
  WORKSTREAMS_UPDATED: "workstreams:updated",
  WORKSTREAM_CREATED: "workstream:created",
  WORKSTREAM_MERGED: "workstream:merged",
  ANALYSIS_STARTED: "analysis:started",
  ANALYSIS_COMPLETED: "analysis:completed",
} as const;

/**
 * Workstream update payload
 */
export interface WorkstreamUpdatePayload {
  sessionId: string;
  workstreams: Array<{
    id: string;
    name: string;
    color: string;
    category?: string | null;
    summary?: string | null;
    captureCount: number;
    totalDurationMinutes: number;
    appsUsed: string[];
    isProvisional: boolean;
  }>;
  analysisNumber: number;
  timestamp: number;
}

/**
 * Analysis status payload
 */
export interface AnalysisStatusPayload {
  sessionId: string;
  status: "started" | "completed" | "failed";
  analysisNumber?: number;
  error?: string;
}

/**
 * Socket Service singleton
 */
class SocketService {
  private io: SocketIOServer | null = null;
  private initialized = false;

  /**
   * Initialize Socket.IO with the HTTP server
   */
  initialize(httpServer: HTTPServer): void {
    if (this.initialized) {
      logger.warn("[Socket] Already initialized, skipping");
      return;
    }

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*", // In production, restrict this to your frontend domain
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupConnectionHandlers();
    this.initialized = true;
    logger.info("[Socket] Socket.IO server initialized");
  }

  /**
   * Set up connection handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on("connection", (socket: Socket) => {
      logger.debug({ socketId: socket.id }, "[Socket] Client connected");

      // Handle joining a session room
      socket.on(SOCKET_EVENTS.JOIN_SESSION, (data: { sessionId: string }) => {
        if (data?.sessionId) {
          const room = `session:${data.sessionId}`;
          socket.join(room);
          logger.debug(
            { socketId: socket.id, sessionId: data.sessionId },
            "[Socket] Client joined session room"
          );
        }
      });

      // Handle leaving a session room
      socket.on(SOCKET_EVENTS.LEAVE_SESSION, (data: { sessionId: string }) => {
        if (data?.sessionId) {
          const room = `session:${data.sessionId}`;
          socket.leave(room);
          logger.debug(
            { socketId: socket.id, sessionId: data.sessionId },
            "[Socket] Client left session room"
          );
        }
      });

      // Handle disconnection
      socket.on("disconnect", (reason) => {
        logger.debug(
          { socketId: socket.id, reason },
          "[Socket] Client disconnected"
        );
      });
    });
  }

  /**
   * Emit workstream update to all clients in a session
   */
  emitWorkstreamUpdate(payload: WorkstreamUpdatePayload): void {
    if (!this.io) {
      logger.warn("[Socket] Cannot emit - Socket.IO not initialized");
      return;
    }

    const room = `session:${payload.sessionId}`;
    this.io.to(room).emit(SOCKET_EVENTS.WORKSTREAMS_UPDATED, payload);
    logger.debug(
      { sessionId: payload.sessionId, workstreamCount: payload.workstreams.length },
      "[Socket] Emitted workstream update"
    );
  }

  /**
   * Emit analysis status update
   */
  emitAnalysisStatus(payload: AnalysisStatusPayload): void {
    if (!this.io) {
      logger.warn("[Socket] Cannot emit - Socket.IO not initialized");
      return;
    }

    const room = `session:${payload.sessionId}`;
    const event =
      payload.status === "started"
        ? SOCKET_EVENTS.ANALYSIS_STARTED
        : SOCKET_EVENTS.ANALYSIS_COMPLETED;

    this.io.to(room).emit(event, payload);
    logger.debug(
      { sessionId: payload.sessionId, status: payload.status },
      "[Socket] Emitted analysis status"
    );
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export const socketService = new SocketService();
