/**
 * Audio Streaming Routes
 *
 * WebSocket endpoint for receiving audio from Electron and forwarding to Deepgram
 */

import { Router } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import { deepgramTranscriptionService } from "../services/deepgramTranscriptionService.js";
import { supabase } from "../domains/shared-infra/lib/supabase.js";
import { logger } from "../domains/shared-infra/lib/logger.js";

const router = Router();

// Store WebSocket connections by session ID
const audioConnections = new Map<string, WebSocket>();

/**
 * Close the audio WebSocket for a session (called from session-end routes)
 */
export function closeAudioConnection(sessionId: string): void {
  const ws = audioConnections.get(sessionId);
  if (ws) {
    logger.info(`🔌 Closing audio WebSocket for ended session: ${sessionId}`);
    ws.close(1000, "Session ended");
    audioConnections.delete(sessionId);
  }
}

/**
 * Initialize WebSocket server for audio streaming
 * This should be called from index.ts when setting up the HTTP server
 */
export function initializeAudioWebSocket(server: any) {
  const wss = new WebSocketServer({
    server,
    verifyClient: async (
      info: { origin: string; secure: boolean; req: any },
      callback: (result: boolean, code?: number, message?: string) => void
    ) => {
      const url = info.req.url || "";
      if (!url.startsWith("/audio-stream/")) {
        callback(false, 404, "Not found");
        return;
      }

      // Extract token from query param: /audio-stream/:sessionId?token=xxx
      try {
        const parsedUrl = new URL(url, "http://localhost");
        const token = parsedUrl.searchParams.get("token");

        if (!token) {
          logger.warn("❌ Audio WebSocket rejected: No auth token");
          callback(false, 401, "Authentication required");
          return;
        }

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);
        if (error || !user) {
          logger.warn("❌ Audio WebSocket rejected: Invalid token");
          callback(false, 401, "Invalid or expired token");
          return;
        }

        // Attach user to request for use in connection handler
        (info.req as any).authenticatedUserId = user.id;
        callback(true);
      } catch (error) {
        logger.error({ err: error }, "❌ Audio WebSocket auth error");
        callback(false, 500, "Authentication failed");
      }
    },
  });

  wss.on("connection", (ws, req) => {
    // Extract session ID from URL path (strip query params)
    const urlPath = (req.url || "").split("?")[0];
    const sessionId = urlPath.split("/").pop();
    const userId = (req as any).authenticatedUserId;

    if (!sessionId) {
      logger.warn("❌ Audio WebSocket connection rejected: No session ID");
      ws.close(1008, "Session ID required");
      return;
    }

    logger.info(`🎤 Audio WebSocket connected for session: ${sessionId} (user: ${userId})`);
    audioConnections.set(sessionId, ws);

    // Start Deepgram transcription for this session
    deepgramTranscriptionService.startTranscription(sessionId).then((result) => {
      if (!result.success) {
        logger.error(`❌ Failed to start transcription: ${result.error}`);
        ws.send(JSON.stringify({ error: result.error }));
        ws.close(1011, "Transcription initialization failed");
      } else {
        logger.info(`✅ Deepgram transcription started for session: ${sessionId}`);
        ws.send(JSON.stringify({ status: "ready" }));
      }
    });

    // Handle incoming audio chunks
    ws.on("message", (data: Buffer) => {
      try {
        // If Deepgram session is gone (closed/errored), close the WebSocket to stop the flood
        if (!deepgramTranscriptionService.isActive(sessionId)) {
          logger.info(`🔌 Closing audio WebSocket: Deepgram session ended for ${sessionId}`);
          ws.close(1000, "Transcription session ended");
          return;
        }
        // Forward audio chunk to Deepgram
        deepgramTranscriptionService.sendAudioChunk(sessionId, data);
      } catch (error) {
        logger.error({ err: error }, "❌ Error processing audio chunk");
      }
    });

    // Handle WebSocket errors
    ws.on("error", (error) => {
      logger.error({ err: error }, `❌ Audio WebSocket error for session ${sessionId}`);
    });

    // Handle connection close
    ws.on("close", (code, reason) => {
      logger.info(
        `🔌 Audio WebSocket closed for session ${sessionId}. Code: ${code}, Reason: ${reason.toString()}`
      );

      // Stop Deepgram transcription
      deepgramTranscriptionService.stopTranscription(sessionId);

      // Remove from connections map
      audioConnections.delete(sessionId);
    });
  });

  logger.info("✅ Audio WebSocket server initialized at /audio-stream");
}

export default router;
