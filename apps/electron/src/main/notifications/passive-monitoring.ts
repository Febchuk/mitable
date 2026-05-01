import { monitoringLogger } from "../loggers";
// @deprecated — imports below unused after passive monitoring auto-start was disabled
// import { preferencesService } from "../../services/preferencesService";
// import { passiveMonitorService } from "../../services/passiveMonitorService";

export interface PassiveMonitoringCallbacks {
  startSession: () => Promise<{ sessionId: string } | undefined>;
  endSession: (sessionId: string) => Promise<void> | void;
  isAudioActive: () => boolean;
}

/**
 * Auto-enable passive monitoring if the user's preference allows it (default: true).
 * Called after user context is established (login or session restore).
 *
 * @deprecated Passive monitoring auto-start is disabled — feature under review.
 * Kept as a no-op so existing call-sites don't break.
 */
export function autoEnablePassiveMonitoring(
  _userId: string,
  _callbacks?: PassiveMonitoringCallbacks
) {
  monitoringLogger.info("Passive monitoring auto-start disabled (deprecated)");
  return;
}
