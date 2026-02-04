/**
 * Deepgram Transcription Service
 *
 * Manages Deepgram WebSocket connections for real-time audio transcription.
 *
 * Features:
 * - Real-time streaming transcription with speaker diarization
 * - Automatic transcript storage in database
 * - Session-based connection management
 * - Error handling and reconnection logic
 *
 * @module deepgramTranscriptionService
 */

// Force Deepgram SDK to use ws library instead of Undici WebSocket
// This prevents Undici from swallowing handshake errors (401, 400, etc.)
import WS from "ws";
(globalThis as any).WebSocket = WS as any;

import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { db } from "../db/client.js";
import { sessionTranscripts } from "../db/schema/monitoring.schema.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";

// ===========================
// Types & Interfaces
// ===========================

interface TranscriptionSession {
  sessionId: string;
  connection: any; // Deepgram LiveConnection
  isActive: boolean;
  startedAt: Date;
  accumulatedText: string; // Accumulate all transcripts
  speakerSegments: Array<{ speakerId: number; text: string; timestamp: number }>; // Track speaker changes
}

// ===========================
// DeepgramTranscriptionService Class
// ===========================

class DeepgramTranscriptionService {
  private deepgram: any;
  private sessions: Map<string, TranscriptionSession> = new Map();

  constructor() {
    // Initialize Deepgram client
    if (!config.deepgram.apiKey) {
      logger.warn("⚠️ DEEPGRAM_API_KEY not found in environment variables");
      return;
    }

    // Mask API key for logging (show first 8 and last 4 chars)
    const maskedKey =
      config.deepgram.apiKey.length > 12
        ? `${config.deepgram.apiKey.substring(0, 8)}...${config.deepgram.apiKey.slice(-4)}`
        : "***";

    this.deepgram = createClient(config.deepgram.apiKey);
    logger.info(`✅ Deepgram client initialized with key: ${maskedKey}`);
  }

  /**
   * Start transcription for a session
   */
  async startTranscription(sessionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (this.sessions.has(sessionId)) {
      return {
        success: false,
        error: "Transcription already active for this session",
      };
    }

    if (!this.deepgram) {
      return {
        success: false,
        error: "Deepgram client not initialized. Check DEEPGRAM_API_KEY.",
      };
    }

    try {
      logger.info(`[Deepgram] Starting transcription for session: ${sessionId}`);

      // Create live transcription connection with stereo multichannel support
      const connection = this.deepgram.listen.live({
        model: "nova-2", // Latest Deepgram model
        language: "en",

        // Audio format params (REQUIRED for raw PCM)
        encoding: "linear16", // 16-bit PCM
        sample_rate: 16000, // Must match AudioContext sample rate
        channels: 2, // Stereo: L=mic, R=system

        // Multichannel transcription
        multichannel: true, // Transcribe each channel independently

        // Speaker diarization (still useful for multiple speakers per channel)
        diarize: true,
        diarize_version: "latest",

        // Formatting
        smart_format: true, // Automatic punctuation and formatting
        punctuate: true,

        // Streaming behavior
        interim_results: true, // Required for utterance_end_ms feature
        utterance_end_ms: 1000, // 1 second silence = end of utterance
        endpointing: 300, // Endpointing sensitivity
      });

      // Handle connection opened
      connection.on(LiveTranscriptionEvents.Open, () => {
        logger.info(`✅ Deepgram connection opened for session: ${sessionId}`);
      });

      // Handle transcription results
      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        try {
          // Only process final results
          if (!data.is_final) {
            return;
          }

          const transcript = data.channel.alternatives[0].transcript;

          // Skip empty transcripts
          if (!transcript || transcript.trim().length === 0) {
            return;
          }

          // Extract speaker information
          const words = data.channel.alternatives[0].words || [];
          const speakerId =
            words.length > 0 && words[0].speaker !== undefined ? words[0].speaker : 0;

          // Accumulate text instead of saving immediately
          const session = this.sessions.get(sessionId);
          if (session) {
            session.accumulatedText += transcript + " ";
            session.speakerSegments.push({
              speakerId,
              text: transcript,
              timestamp: data.start,
            });
            logger.info(
              `📝 Accumulated (Speaker ${speakerId}): "${transcript.substring(0, 50)}..." (total: ${session.accumulatedText.length} chars)`
            );
          }
        } catch (error) {
          logger.error({ err: error }, "❌ Error processing transcript");
        }
      });

      // Handle speech started
      connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
        logger.debug(`🎤 Speech detected for session: ${sessionId}`);
      });

      // Handle utterance end
      connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        logger.debug(`⏸️ Utterance ended for session: ${sessionId}`);
      });

      // Handle errors
      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        logger.error({ err: error, sessionId }, `❌ Deepgram error for session ${sessionId}`);
      });

      // Handle connection closed
      connection.on(LiveTranscriptionEvents.Close, () => {
        logger.info(`🔌 Deepgram connection closed for session: ${sessionId}`);
        this.sessions.delete(sessionId);
      });

      // Store session state
      this.sessions.set(sessionId, {
        sessionId,
        connection,
        isActive: true,
        startedAt: new Date(),
        accumulatedText: "",
        speakerSegments: [],
      });

      logger.info(`✅ Transcription started for session: ${sessionId}`);

      return { success: true };
    } catch (error) {
      logger.error({ err: error }, "❌ Failed to start transcription");
      return {
        success: false,
        error: `Failed to start transcription: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Send audio chunk to Deepgram
   */
  sendAudioChunk(sessionId: string, audioBuffer: Buffer): void {
    const session = this.sessions.get(sessionId);

    if (!session || !session.isActive) {
      logger.warn(`⚠️ Cannot send audio: No active session for ${sessionId}`);
      return;
    }

    try {
      session.connection.send(audioBuffer);
    } catch (error) {
      logger.error({ err: error }, `❌ Error sending audio to Deepgram for session ${sessionId}`);
    }
  }

  /**
   * Stop transcription for a session
   */
  async stopTranscription(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`⚠️ No transcription session found for ${sessionId}`);
      return;
    }

    try {
      logger.info(`🛑 Stopping transcription for session: ${sessionId}`);

      // Save accumulated transcript to database
      if (session.accumulatedText.trim().length > 0) {
        // Determine primary speaker (most common speaker ID)
        const speakerCounts = new Map<number, number>();
        session.speakerSegments.forEach((seg) => {
          speakerCounts.set(seg.speakerId, (speakerCounts.get(seg.speakerId) || 0) + 1);
        });
        const primarySpeaker =
          Array.from(speakerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;

        const sessionDuration = (new Date().getTime() - session.startedAt.getTime()) / 1000;

        await db.insert(sessionTranscripts).values({
          sessionId,
          speakerId: primarySpeaker,
          transcript: session.accumulatedText.trim(),
          startTime: session.startedAt,
          endTime: new Date(),
          confidence: 1.0, // Average confidence would be better, but this is simpler
        });

        logger.info(
          `✅ Saved full transcript for session ${sessionId}: ${session.accumulatedText.length} characters, ${session.speakerSegments.length} segments, ${sessionDuration.toFixed(1)}s duration`
        );
      }

      // Close Deepgram connection
      if (session.connection) {
        await session.connection.finish();
      }

      // Remove from active sessions
      this.sessions.delete(sessionId);

      logger.info(`✅ Transcription stopped for session: ${sessionId}`);
    } catch (error) {
      logger.error({ err: error }, `❌ Error stopping transcription for session ${sessionId}`);
    }
  }

  /**
   * Check if transcription is active for a session
   */
  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get accumulated transcript for a session (for classifier context)
   */
  getAccumulatedTranscript(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session?.accumulatedText.trim() || null;
  }

  /**
   * Get speaker segments for a session
   */
  getSpeakerSegments(
    sessionId: string
  ): Array<{ speakerId: number; text: string; timestamp: number }> {
    const session = this.sessions.get(sessionId);
    return session?.speakerSegments || [];
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// Export singleton instance
export const deepgramTranscriptionService = new DeepgramTranscriptionService();
