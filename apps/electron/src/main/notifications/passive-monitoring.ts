import { monitoringLogger } from "../loggers";
import { preferencesService } from "../../services/preferencesService";
import { passiveMonitorService } from "../../services/passiveMonitorService";

export interface PassiveMonitoringCallbacks {
  startSession: () => Promise<{ sessionId: string } | undefined>;
  endSession: (sessionId: string) => Promise<void> | void;
  isAudioActive: () => boolean;
}

/**
 * Auto-enable passive monitoring if the user's preference allows it (default: true).
 * Called after user context is established (login or session restore).
 */
export function autoEnablePassiveMonitoring(userId: string, callbacks: PassiveMonitoringCallbacks) {
  const enabled = preferencesService.getUserPassiveMonitoringEnabled(userId);
  if (!enabled) {
    monitoringLogger.info("Passive monitoring preference is off, skipping auto-enable");
    return;
  }

  const { state } = passiveMonitorService.getState();
  if (state !== "disabled") {
    monitoringLogger.info(`Passive monitoring already ${state}, skipping auto-enable`);
    return;
  }

  monitoringLogger.info("Auto-enabling passive monitoring on startup");
  passiveMonitorService.enable({
    startSession: callbacks.startSession,
    endSession: callbacks.endSession,
    isAudioActive: callbacks.isAudioActive,
  });
}
