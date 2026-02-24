/**
 * Audio WebSocket Service
 *
 * Manages WebSocket connection to backend for audio streaming.
 * Sends audio chunks from renderer to backend for Deepgram transcription.
 *
 * @module audioWebSocketService
 */

import WebSocket from "ws";
import { createLogger } from "../lib/logger";

const logger = createLogger("AudioWebSocket");

// ===========================
// Types & Interfaces
// ===========================

interface AudioConnectionState {
  sessionId: string;
  backendUrl: string;
  token: string;
  ws: WebSocket | null;
  isConnected: boolean;
  reconnectAttempts: number;
}

// ===========================
// AudioWebSocketService Class
// ===========================

class AudioWebSocketService {
  private connection: AudioConnectionState | null = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly BASE_RECONNECT_DELAY_MS = 2000;
  private reconnectCount = 0;

  /**
   * Connect to backend WebSocket for audio streaming
   */
  async connect(
    sessionId: string,
    backendUrl: string,
    token: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (this.connection?.isConnected) {
      return {
        success: false,
        error: "WebSocket already connected",
      };
    }

    logger.info(`[AudioWebSocket] Connecting to backend: ${backendUrl}/audio-stream/${sessionId}`);

    try {
      const wsUrl = backendUrl.replace(/^http/, "ws");
      const ws = new WebSocket(
        `${wsUrl}/audio-stream/${sessionId}?token=${encodeURIComponent(token)}`
      );

      this.connection = {
        sessionId,
        backendUrl,
        token,
        ws,
        isConnected: false,
        reconnectAttempts: this.reconnectCount,
      };

      // Handle connection opened
      ws.on("open", () => {
        logger.info("✅ WebSocket connection opened");
        if (this.connection) {
          this.connection.isConnected = true;
          this.connection.reconnectAttempts = 0;
          this.reconnectCount = 0;
        }
      });

      // Handle messages from backend
      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          logger.debug("📨 Message from backend:", message);
        } catch (error) {
          logger.error("❌ Error parsing WebSocket message:", error);
        }
      });

      // Handle errors
      ws.on("error", (error) => {
        logger.error("❌ WebSocket error:", error);
      });

      // Handle connection closed
      ws.on("close", (code, reason) => {
        const reasonStr = reason.toString();
        logger.info(`🔌 WebSocket closed. Code: ${code}, Reason: ${reasonStr}`);

        if (this.connection) {
          this.connection.isConnected = false;

          // Don't reconnect on intentional close or auth failures
          const isAuthFailure =
            code === 1006 || reasonStr.includes("401") || reasonStr.includes("Invalid");
          if (code === 1000 || isAuthFailure) {
            if (isAuthFailure) {
              logger.warn("🚫 Auth failure — not retrying with stale token");
            }
            return;
          }

          // Attempt reconnection for transient failures only
          if (this.reconnectCount < this.MAX_RECONNECT_ATTEMPTS) {
            this.attemptReconnect();
          } else {
            logger.warn(
              `🚫 Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached — giving up`
            );
          }
        }
      });

      return { success: true };
    } catch (error) {
      logger.error("❌ Failed to connect WebSocket:", error);
      return {
        success: false,
        error: `Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Send audio chunk to backend
   */
  sendAudioChunk(audioBuffer: ArrayBuffer): void {
    if (!this.connection || !this.connection.isConnected || !this.connection.ws) {
      logger.warn("⚠️ Cannot send audio chunk: WebSocket not connected");
      return;
    }

    try {
      // Convert ArrayBuffer to Buffer for WebSocket
      const buffer = Buffer.from(audioBuffer);
      this.connection.ws.send(buffer);
    } catch (error) {
      logger.error("❌ Error sending audio chunk:", error);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (!this.connection) {
      logger.warn("⚠️ No active connection to disconnect");
      return;
    }

    logger.info(`[AudioWebSocket] Disconnecting from session: ${this.connection.sessionId}`);

    try {
      if (this.connection.ws) {
        // Close with code 1000 (normal closure) to prevent reconnection
        this.connection.ws.close(1000, "Session ended");
      }
    } catch (error) {
      logger.error("❌ Error disconnecting WebSocket:", error);
    } finally {
      this.connection = null;
      this.reconnectCount = 0;
    }
  }

  /**
   * Attempt to reconnect WebSocket
   */
  private async attemptReconnect(): Promise<void> {
    if (!this.connection) return;

    this.reconnectCount++;
    this.connection.reconnectAttempts = this.reconnectCount;

    const delay = this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectCount - 1);
    logger.info(
      `🔄 Attempting reconnection ${this.reconnectCount}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`
    );

    setTimeout(() => {
      if (this.connection) {
        this.connect(this.connection.sessionId, this.connection.backendUrl, this.connection.token);
      }
    }, delay);
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.connection?.isConnected ?? false;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.connection?.sessionId ?? null;
  }
}

// Export singleton instance
export const audioWebSocketService = new AudioWebSocketService();
