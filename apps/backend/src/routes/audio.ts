/**
 * Audio Streaming Routes
 *
 * WebSocket endpoint for receiving audio from Electron and forwarding to Deepgram
 */

import { Router } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { deepgramTranscriptionService } from "../services/deepgramTranscriptionService.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Store WebSocket connections by session ID
const audioConnections = new Map<string, WebSocket>();

/**
 * Initialize WebSocket server for audio streaming
 * This should be called from index.ts when setting up the HTTP server
 */
export function initializeAudioWebSocket(server: any) {
  const wss = new WebSocketServer({
    server,
    // Don't set a fixed path - we need to accept /audio-stream/:sessionId
    verifyClient: (info: { origin: string; secure: boolean; req: any }) => {
      // Accept any connection that starts with /audio-stream/
      const url = info.req.url || "";
      return url.startsWith("/audio-stream/");
    },
  });

  wss.on("connection", (ws, req) => {
    // Extract session ID from URL path: /audio-stream/:sessionId
    const sessionId = req.url?.split("/").pop();

    if (!sessionId) {
      logger.warn("❌ Audio WebSocket connection rejected: No session ID");
      ws.close(1008, "Session ID required");
      return;
    }

    logger.info(`🎤 Audio WebSocket connected for session: ${sessionId}`);
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
