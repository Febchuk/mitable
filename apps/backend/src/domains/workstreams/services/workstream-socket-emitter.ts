/**
 * Workstream Socket Emitter
 *
 * Connects the workstream RLM service to the Socket.IO service.
 * Broadcasts workstream updates to connected clients in real-time.
 */

import { workstreamRLMService, type WorkstreamUpdateEvent } from "./workstream-rlm.service.js";
import { socketService, type WorkstreamUpdatePayload } from "../../shared-infra/services/socket.service.js";
import { logger } from "../../shared-infra/lib/logger.js";

/**
 * Set up the event listener to bridge RLM service events to WebSocket
 */
export function setupWorkstreamSocketEmitter(): void {
  // Listen for workstream updates from the RLM service
  workstreamRLMService.on("workstreamsUpdated", (event: WorkstreamUpdateEvent) => {
    logger.debug(
      {
        sessionId: event.sessionId,
        workstreamCount: event.workstreams.length,
        analysisNumber: event.analysisNumber,
      },
      "[WorkstreamSocketEmitter] Received workstreams update event"
    );

    // Transform to WebSocket payload format
    const payload: WorkstreamUpdatePayload = {
      sessionId: event.sessionId,
      workstreams: event.workstreams.map((ws) => ({
        id: ws.id,
        name: ws.name,
        color: ws.color,
        category: ws.category,
        summary: ws.summary,
        captureCount: ws.captureCount,
        totalDurationMinutes: ws.totalDurationMinutes,
        appsUsed: ws.appsUsed || [],
        isProvisional: ws.isProvisional,
      })),
      analysisNumber: event.analysisNumber,
      timestamp: event.timestamp,
    };

    // Emit via WebSocket
    socketService.emitWorkstreamUpdate(payload);

    logger.info(
      {
        sessionId: event.sessionId,
        analysisNumber: event.analysisNumber,
        workstreamCount: event.workstreams.length,
      },
      "[WorkstreamSocketEmitter] Broadcasted workstream update via WebSocket"
    );
  });

  logger.info("[WorkstreamSocketEmitter] Event bridge initialized");
}
