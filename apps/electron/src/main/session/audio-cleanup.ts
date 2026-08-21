import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { monitoringLogger } from "../loggers";
import { audioWebSocketService } from "../../services/audioWebSocketService";
import { authManager } from "../../services/authManager";

/**
 * Stop audio recording infrastructure: disconnect WS, notify backend, tell renderer to kill AudioWorklet.
 * Called from all session-end paths so audio doesn't keep streaming after the session is gone.
 */
export async function cleanupAudioRecording(sessionId?: string): Promise<void> {
  ctx.audioCleanupDone = true;

  // Stop native audio capture — fire and forget so the final Whisper transcription
  // pass doesn't block processAllAtEnd from starting. Transcript segments already
  // accumulated during recording are in the timeline and available immediately.
  try {
    const { localAudioService, nativeAudioCapture } = await import("../../services/on-device");
    if (nativeAudioCapture.isActive()) {
      localAudioService
        .stop()
        .catch((err: unknown) =>
          monitoringLogger.debug("On-device audio stop error (non-blocking):", String(err))
        );
    }
  } catch (err) {
    monitoringLogger.debug("On-device audio cleanup skipped:", String(err));
  }

  audioWebSocketService.disconnect();

  if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
    ctx.watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
  }

  // Best-effort backend notification (non-blocking for local-first)
  if (sessionId) {
    authManager
      .authenticatedFetch(`/api/monitoring/sessions/${sessionId}/audio/stop`, { method: "POST" })
      .catch(() => {
        /* offline — no-op */
      });
  }

  monitoringLogger.info(
    "🔇 Audio recording cleaned up" + (sessionId ? ` for session ${sessionId}` : "")
  );
}
