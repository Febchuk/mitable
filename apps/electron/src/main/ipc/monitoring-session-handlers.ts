import { BrowserWindow, ipcMain, nativeTheme, shell, systemPreferences } from "electron";
import { IPC_CHANNELS, SESSION_DEFAULTS } from "@mitable/shared";
import { ctx } from "../context";
import { ipcLogger, monitoringLogger, recoveryLogger } from "../loggers";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { windowDetectionService } from "../../services/windowDetectionService";
import { preferencesService } from "../../services/preferencesService";
import { authManager } from "../../services/authManager";
import { audioWebSocketService } from "../../services/audioWebSocketService";
import { passiveMonitorService } from "../../services/passiveMonitorService";
import { focusWindowTracker } from "../../services/focusWindowTracker";
import { trackMainEvent } from "../../services/analyticsService";
import { pgDb } from "../../services/on-device/pgDb";
import { installedAppsService } from "../../services/installedAppsService";
import { createWatchingPillWindow, showPillReliably, startPillCursorTracking } from "../windows";
import { startSessionFromMain, endPassiveSessionFromMain } from "../session";
import { startNotificationTimer } from "../notifications";

export function registerMonitoringSessionHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.MONITORING_SESSION_START,
    async (
      _event,
      config: {
        sessionId: string;
        selectedWindows: any[];
        captureIntervalMs?: number;
        name?: string;
        userId: string;
        organizationId: string;
      }
    ) => {
      monitoringLogger.info(" Starting session:", {
        sessionId: config.sessionId,
        windowCount: config.selectedWindows.length,
        intervalMs: config.captureIntervalMs,
      });

      windowDetectionService.clearAll();

      for (const windowInfo of config.selectedWindows) {
        windowDetectionService.addWindow({
          windowId: windowInfo.windowId,
          appName: windowInfo.appName,
          windowTitle: windowInfo.windowTitle,
        });
      }

      const selectedWindows = windowDetectionService.getSelectedWindows();
      const allWindows = [ctx.consoleWindow, ctx.watchingPillWindow];
      for (const window of allWindows) {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, selectedWindows);
        }
      }

      await passiveMonitorService.onManualSessionStart();

      const result = await monitoringSessionService.startSession({
        sessionId: config.sessionId,
        selectedWindows: config.selectedWindows,
        captureIntervalMs: config.captureIntervalMs || SESSION_DEFAULTS.CAPTURE_INTERVAL_MS,
        name: config.name,
        userId: config.userId,
        organizationId: config.organizationId,
      });

      if (!result.error) {
        trackMainEvent(config.userId, "electron_session_started", {
          session_id: config.sessionId,
          window_count: config.selectedWindows.length,
          capture_interval_ms: config.captureIntervalMs || SESSION_DEFAULTS.CAPTURE_INTERVAL_MS,
        });
        const shouldShowPill = preferencesService.getShowPillOnSessionStart();
        if (shouldShowPill) {
          if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) {
            createWatchingPillWindow();
          }
          if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
            showPillReliably(ctx.watchingPillWindow);
            startPillCursorTracking();
          }
        }
      }

      return result;
    }
  );

  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_PAUSE, async () => {
    monitoringLogger.info(" Pausing session");
    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_session_paused", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }

    let nativeAudioWasActive = false;
    try {
      const { nativeAudioCapture } = await import("../../services/on-device");
      nativeAudioWasActive = nativeAudioCapture.isActive();
    } catch {
      /* on-device module not available */
    }

    ctx.audioActiveBeforePause = audioWebSocketService.isConnected() || nativeAudioWasActive;

    if (ctx.audioActiveBeforePause) {
      monitoringLogger.info("🔇 Pausing audio recording");

      if (nativeAudioWasActive) {
        try {
          const { localAudioService } = await import("../../services/on-device");
          await localAudioService.stop();
        } catch (err) {
          monitoringLogger.error("Failed to stop native audio on pause:", err);
        }
      }

      audioWebSocketService.disconnect();
      if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
        ctx.watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
      }
    }

    return monitoringSessionService.pauseSession();
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESUME, async () => {
    monitoringLogger.info(" Resuming session");
    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_session_resumed", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }
    const result = await monitoringSessionService.resumeSession();

    if (result.success && ctx.audioActiveBeforePause) {
      monitoringLogger.info("🎤 Audio was active before pause — signalling pill to restart");
      ctx.audioActiveBeforePause = false;
      if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
        ctx.watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_START);
      }
    }

    return result;
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_END, async () => {
    monitoringLogger.info(" Ending session");
    ctx.audioActiveBeforePause = false;

    const preEndState = monitoringSessionService.getSessionState();

    ctx.audioCleanupDone = true;
    audioWebSocketService.disconnect();
    if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      ctx.watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
    }

    const result = await monitoringSessionService.endSession();

    if (result.success && ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_session_ended", {
        session_id: preEndState?.id,
      });
    }

    if (result.success && ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      ctx.watchingPillWindow.hide();
    }

    if (ctx.currentUserContext?.userId) {
      const passiveEnabled = preferencesService.getUserPassiveMonitoringEnabled(
        ctx.currentUserContext.userId
      );
      if (passiveEnabled) {
        passiveMonitorService.onManualSessionEnd();
      }
    }

    return result;
  });

  ipcMain.handle(
    IPC_CHANNELS.MONITORING_SESSION_FINALIZE,
    async (
      _event,
      sessionId: string,
      captures: Array<{
        sequenceNumber: number;
        captureTrigger: "periodic" | "focus_change" | "manual";
        capturedAt: number;
        windowId?: string;
        appName?: string;
        windowTitle?: string;
        screenshotPath?: string;
        screenshotHash?: string;
      }>
    ) => {
      monitoringLogger.info("Finalizing session:", sessionId, "captures:", captures.length);

      // In local-first mode, finalization is handled entirely on-device.
      // Only forward to backend for cloud sessions.
      let isLocalSession = false;
      try {
        const { pgDb } = await import("../../services/on-device");
        const session = await pgDb.getMonitoringSession(sessionId);
        isLocalSession = !!session;
      } catch {
        /* on-device module not available */
      }

      if (isLocalSession) {
        monitoringLogger.info("Finalize: local session — skipping backend calls");
        return { success: true };
      }

      try {
        if (captures.length > 0) {
          monitoringLogger.info(" Uploading", captures.length, "captures to backend");
          const uploadResponse = await authManager.authenticatedFetch(
            `/api/monitoring/sessions/${sessionId}/captures`,
            {
              method: "POST",
              body: JSON.stringify({ captures }),
            }
          );

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            monitoringLogger.error(" Upload captures error:", errorText);
            return { success: false, error: `Failed to upload captures: ${uploadResponse.status}` };
          }
          monitoringLogger.info(" Captures uploaded successfully");
        }

        const autoRecapForFinalize = ctx.currentUserContext?.userId
          ? preferencesService.getUserAutoRecap(ctx.currentUserContext.userId)
          : true;
        const endResponse = await authManager.authenticatedFetch(
          `/api/monitoring/sessions/${sessionId}/end`,
          {
            method: "POST",
            body: JSON.stringify({ autoRecap: autoRecapForFinalize }),
          }
        );

        if (!endResponse.ok) {
          const errorText = await endResponse.text();
          monitoringLogger.error(" End session error:", errorText);
          return { success: false, error: `Failed to end session: ${endResponse.status}` };
        }

        monitoringLogger.info(" Session finalized successfully");
        return { success: true };
      } catch (error) {
        monitoringLogger.error(" Finalize error:", error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESET, async () => {
    monitoringLogger.info(" Resetting session state");
    monitoringSessionService.resetSession();

    if (ctx.currentUserContext?.userId) {
      const passiveEnabled = preferencesService.getUserPassiveMonitoringEnabled(
        ctx.currentUserContext.userId
      );
      if (passiveEnabled) {
        passiveMonitorService.onManualSessionEnd();
      }
    }

    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_DELETE, async (_event, sessionId: string) => {
    monitoringLogger.info(`Deleting session ${sessionId} locally`);
    try {
      const { pgDb } = await import("../../services/on-device");

      // Delete the exported block .md file (lives in Documents/Mitable/blockdata/)
      const exportPath = await pgDb.getExportPath(sessionId);
      if (exportPath) {
        try {
          const fsPromises = await import("fs/promises");
          await fsPromises.unlink(exportPath);
          monitoringLogger.info(`Deleted block markdown: ${exportPath}`);
        } catch {
          monitoringLogger.warn("Could not delete block .md (may already be gone)");
        }
      }

      // Delete all DB records (captures, classifications, stories, transcriptions, session)
      await pgDb.deleteMonitoringSession(sessionId);

      // Delete session folder (frames, thumbnails, audio PCM files)
      try {
        const { localFrameStorage } = await import("../../services/localFrameStorage");
        await localFrameStorage.deleteSession(sessionId);
      } catch {
        monitoringLogger.warn("Could not clean up session files (non-fatal)");
      }

      return { success: true };
    } catch (err) {
      monitoringLogger.error("Delete session failed:", String(err));
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_RESYNC_LOCAL, async () => {
    if (!authManager.getAccessToken()) {
      return { success: false, error: "No auth token — backend unreachable" };
    }

    monitoringLogger.info("Resync: pushing local stories to cloud backend");
    try {
      const { pgDb, localInferenceService } = await import("../../services/on-device");
      const stories = await pgDb.getAllStories();
      if (stories.length === 0) {
        return { success: true, synced: 0, message: "No local stories to sync" };
      }

      let synced = 0;
      const errors: string[] = [];

      for (const story of stories) {
        try {
          const exported = await localInferenceService.exportResultsForBackend(story.sessionId, 0);
          if (!exported) {
            errors.push(`${story.sessionId.slice(0, 8)}: export failed`);
            continue;
          }

          const resp = await authManager.authenticatedFetch(
            `/api/monitoring/sessions/${story.sessionId}/on-device-summary`,
            {
              method: "PUT",
              body: JSON.stringify({ onDeviceSummary: exported }),
            }
          );

          if (resp.ok) {
            synced++;
            monitoringLogger.info(
              `Resync: uploaded ${story.sessionId.slice(0, 8)} (${exported.taskBreakdown.length} tasks)`
            );
          } else {
            const errText = await resp.text();
            errors.push(`${story.sessionId.slice(0, 8)}: ${resp.status} ${errText.slice(0, 100)}`);
          }
        } catch (err) {
          errors.push(`${story.sessionId.slice(0, 8)}: ${String(err).slice(0, 100)}`);
        }
      }

      monitoringLogger.info(`Resync complete: ${synced}/${stories.length} synced`);
      return {
        success: true,
        synced,
        total: stories.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err) {
      monitoringLogger.error("Resync failed:", String(err));
      return { success: false, error: String(err) };
    }
  });

  // Passive monitoring IPC handlers
  ipcMain.handle(IPC_CHANNELS.PASSIVE_MONITORING_SET_ENABLED, async (_, enabled: boolean) => {
    monitoringLogger.info(` Passive monitoring set enabled: ${enabled}`);
    if (enabled) {
      if (ctx.currentUserContext) {
        passiveMonitorService.enable({
          startSession: () => startSessionFromMain("passive"),
          endSession: (sessionId) => endPassiveSessionFromMain(sessionId),
          isAudioActive: () => audioWebSocketService.isConnected(),
        });
        preferencesService.setUserPassiveMonitoringEnabled(ctx.currentUserContext.userId, true);
      } else {
        monitoringLogger.warn(" Cannot enable passive monitoring: no user context");
        return { success: false };
      }
    } else {
      await passiveMonitorService.disable();
      if (ctx.currentUserContext) {
        preferencesService.setUserPassiveMonitoringEnabled(ctx.currentUserContext.userId, false);
      }
    }
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.PASSIVE_MONITORING_GET_STATE, async () => {
    return passiveMonitorService.getState();
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_STATUS, async () => {
    return monitoringSessionService.getSessionState();
  });

  // Session Recovery handlers
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_RECOVERABLE, async () => {
    recoveryLogger.info(" Getting recoverable sessions");
    return monitoringSessionService.getRecoverableSessions(ctx.currentUserContext?.userId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_RECOVER, async (_, sessionId: string) => {
    recoveryLogger.info(" Recovering session:", sessionId);
    return monitoringSessionService.recoverSession(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DISCARD, async (_, sessionId: string) => {
    recoveryLogger.info(" Discarding session:", sessionId);
    await monitoringSessionService.discardRecoverableSession(sessionId);
    return { success: true };
  });

  // Preferences IPC handlers
  ipcMain.handle(IPC_CHANNELS.PREFERENCES_GET, (_, key: string) => {
    return preferencesService.getPreference(key);
  });

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_SET, (_, key: string, value: boolean) => {
    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_preference_changed", {
        preference_key: key,
        new_value: value,
      });
    }
    return preferencesService.setPreference(key, value);
  });

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_GET_ALL, () => {
    return preferencesService.getAllPreferences();
  });

  // Block list IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_GET, (_, userId: string) => {
    return preferencesService.getUserBlockedApps(userId);
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_SET, (_, userId: string, blockedApps: string[]) => {
    if (typeof userId !== "string" || !userId) {
      ipcLogger.warn("BLOCK_LIST_SET rejected: invalid userId");
      return { success: false, error: "Invalid userId" };
    }
    if (!Array.isArray(blockedApps) || blockedApps.length > 1000) {
      ipcLogger.warn(
        "BLOCK_LIST_SET rejected: blockedApps must be an array with at most 1000 items"
      );
      return { success: false, error: "Invalid blockedApps" };
    }
    for (const app of blockedApps) {
      if (typeof app !== "string" || app.length > 500) {
        ipcLogger.warn("BLOCK_LIST_SET rejected: each item must be a string with max 500 chars");
        return { success: false, error: "Invalid app name in blockedApps" };
      }
    }

    preferencesService.setUserBlockedApps(userId, blockedApps);
    focusWindowTracker.removeBlockedWindows();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_ADD, (_, userId: string, appName: string) => {
    preferencesService.addUserBlockedApp(userId, appName);
    focusWindowTracker.removeBlockedWindows();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_REMOVE, (_, userId: string, appName: string) => {
    preferencesService.removeUserBlockedApp(userId, appName);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_GET_DETECTED_APPS, () => {
    const detectedApps = windowDetectionService.getDetectedApps();
    const appsWithOriginalNames = detectedApps.map((normalized) => ({
      normalizedName: normalized,
      originalName: windowDetectionService.getOriginalAppName(normalized) || normalized,
    }));
    return appsWithOriginalNames;
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_GET_ALL_APPS, async (_, forceRefresh?: boolean) => {
    try {
      const allApps = await windowDetectionService.getAllBlockableApps(forceRefresh ?? false);
      const withIcons = await installedAppsService.extractIcons(
        allApps as unknown as Parameters<typeof installedAppsService.extractIcons>[0]
      );
      return { success: true, apps: withIcons };
    } catch (error) {
      ipcLogger.error("Error getting all blockable apps:", error);
      return { success: false, apps: [], error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_REFRESH_INSTALLED_APPS, async () => {
    try {
      await windowDetectionService.refreshInstalledApps();
      const allApps = await windowDetectionService.getAllBlockableApps(false);
      const withIcons = await installedAppsService.extractIcons(
        allApps as unknown as Parameters<typeof installedAppsService.extractIcons>[0]
      );
      return { success: true, apps: withIcons };
    } catch (error) {
      ipcLogger.error("Error refreshing installed apps:", error);
      return { success: false, apps: [], error: (error as Error).message };
    }
  });

  // Notification frequency IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_FREQUENCY_GET, (_, userId: string) => {
    return preferencesService.getUserNotificationFrequency(userId);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_FREQUENCY_SET, (_, userId: string, minutes: number) => {
    if (typeof userId !== "string" || !userId) {
      ipcLogger.warn("NOTIFICATION_FREQUENCY_SET rejected: invalid userId");
      return { success: false, error: "Invalid userId" };
    }
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      ipcLogger.warn(
        "NOTIFICATION_FREQUENCY_SET rejected: minutes must be a number between 1 and 1440"
      );
      return { success: false, error: "Invalid minutes value" };
    }

    preferencesService.setUserNotificationFrequency(userId, minutes);
    startNotificationTimer();
    return { success: true };
  });

  // Audio recording IPC handlers
  ipcMain.handle(IPC_CHANNELS.MONITORING_AUDIO_START, async () => {
    monitoringLogger.info("🎤 Starting audio recording");
    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_audio_started", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }

    ctx.audioCleanupDone = false;

    const sessionState = monitoringSessionService.getSessionState();
    if (!sessionState || !sessionState.id) {
      return {
        success: false,
        hasSystemAudio: false,
        error: "No active session. Start a monitoring session first.",
      };
    }

    try {
      const { localAudioService } = await import("../../services/on-device");
      const { localFrameStorage } = await import("../../services/localFrameStorage");
      const sessionDir = localFrameStorage.getSessionPath(sessionState.id);
      const result = await localAudioService.start(sessionState.id, sessionDir);
      monitoringLogger.info(
        `Native audio capture started (mic: ${result.micStarted}, system: ${result.systemStarted})`
      );
      return { success: true, hasSystemAudio: result.systemStarted, onDevice: true };
    } catch (err) {
      monitoringLogger.error("On-device native audio start failed:", String(err));
    }

    // Native audio failed and no cloud fallback in local mode
    return {
      success: false,
      hasSystemAudio: false,
      error: "Native audio capture unavailable",
    };
  });

  ipcMain.on("audio-chunk", (_event, audioBuffer: ArrayBuffer) => {
    try {
      if (ctx.audioCleanupDone) return;

      const sessionState = monitoringSessionService.getSessionState();
      if (!sessionState?.id) {
        const now = Date.now();
        if (now - ctx.lastAudioChunkWarnAt > 5000) {
          monitoringLogger.warn(
            "⚠️ Received audio chunk but no active session (throttled, suppressing for 5s)"
          );
          ctx.lastAudioChunkWarnAt = now;
        }
        return;
      }

      audioWebSocketService.sendAudioChunk(audioBuffer);
    } catch (error) {
      monitoringLogger.error("❌ Error processing audio chunk:", error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_AUDIO_STOP, async () => {
    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_audio_stopped", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }
    monitoringLogger.info("🔇 Stopping audio recording");

    try {
      const { localAudioService, nativeAudioCapture } = await import("../../services/on-device");
      if (nativeAudioCapture.isActive()) {
        await localAudioService.stop();
        monitoringLogger.info("Native audio capture stopped");
        return { success: true };
      }
    } catch (err) {
      monitoringLogger.debug("On-device audio stop skipped:", String(err));
    }

    audioWebSocketService.disconnect();
    return { success: true };
  });

  // Auto recap IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.AUTO_RECAP_GET, (_, userId: string) => {
    return preferencesService.getUserAutoRecap(userId);
  });

  ipcMain.handle(IPC_CHANNELS.AUTO_RECAP_SET, (_, userId: string, enabled: boolean) => {
    preferencesService.setUserAutoRecap(userId, enabled);
    return { success: true };
  });

  // Agent feature toggle IPC handlers
  ipcMain.handle(IPC_CHANNELS.AGENT_ENABLED_GET, (_, userId: string) => {
    return preferencesService.getUserAgentEnabled(userId);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_ENABLED_SET, (_, userId: string, enabled: boolean) => {
    preferencesService.setUserAgentEnabled(userId, enabled);
    return { success: true };
  });

  // Permissions IPC handlers (macOS)
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET_STATUS, () => {
    if (process.platform === "darwin") {
      return {
        screen: systemPreferences.getMediaAccessStatus("screen"),
        accessibility: systemPreferences.isTrustedAccessibilityClient(false),
      };
    }
    return { screen: "granted", accessibility: true };
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_REQUEST_ACCESSIBILITY, () => {
    if (process.platform === "darwin") {
      systemPreferences.isTrustedAccessibilityClient(true);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_SCREEN_RECORDING, async () => {
    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
      );
    }
  });

  // Summary preferences IPC handlers
  ipcMain.handle(IPC_CHANNELS.SUMMARY_PREFERENCES_GET, () => {
    return preferencesService.getSummaryPreferences();
  });

  ipcMain.handle(
    IPC_CHANNELS.SUMMARY_PREFERENCES_SET,
    (
      _,
      prefs: {
        detailLevel?: "concise" | "verbose";
        format?: "bullets" | "paragraphs";
        includeScreenshots?: boolean;
        alwaysAskOnSessionEnd?: boolean;
      }
    ) => {
      return preferencesService.setSummaryPreferences(prefs);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SUMMARY_DEFAULTS_GET, () => {
    return preferencesService.getSummaryDefaults();
  });

  ipcMain.handle(
    IPC_CHANNELS.SUMMARY_DEFAULTS_SET,
    (
      _,
      defaults: {
        detailLevel?: "concise" | "verbose";
        format?: "bullets" | "paragraphs";
        includeScreenshots?: boolean;
      }
    ) => {
      return preferencesService.setSummaryDefaults(defaults);
    }
  );

  ipcMain.handle(IPC_CHANNELS.ALWAYS_ASK_ON_SESSION_END_GET, () => {
    return preferencesService.getAlwaysAskOnSessionEnd();
  });

  ipcMain.handle(IPC_CHANNELS.ALWAYS_ASK_ON_SESSION_END_SET, (_, value: boolean) => {
    return preferencesService.setAlwaysAskOnSessionEnd(value);
  });

  // Audio preferences IPC handlers
  ipcMain.handle(IPC_CHANNELS.AUDIO_DEVICES_ENUMERATE, async () => {
    try {
      if (!ctx.consoleWindow || ctx.consoleWindow.isDestroyed()) {
        return { success: false, devices: [], error: "Console window not available" };
      }

      const audioInputs = await ctx.consoleWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices
              .filter(d => d.kind === 'audioinput')
              .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone ' + d.deviceId.slice(0, 8), groupId: d.groupId }));
            stream.getTracks().forEach(t => t.stop());
            return inputs;
          } catch (e) {
            return [];
          }
        })()
      `);

      monitoringLogger.info(`🎤 Found ${audioInputs.length} audio input devices`);
      return { success: true, devices: audioInputs };
    } catch (error) {
      monitoringLogger.error("Failed to enumerate audio devices:", error);
      return {
        success: false,
        devices: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_PREFERENCES_GET, () => {
    return preferencesService.getAudioPreferences();
  });

  ipcMain.handle(
    IPC_CHANNELS.AUDIO_PREFERENCES_SET,
    async (
      _,
      prefs: {
        microphoneDeviceId?: string | null;
        systemAudioEnabled?: boolean;
      }
    ) => {
      const oldPrefs = preferencesService.getAudioPreferences();
      const result = preferencesService.setAudioPreferences(prefs);

      // If mic preference changed while recording, hot-swap the microphone
      if (
        prefs.microphoneDeviceId !== undefined &&
        prefs.microphoneDeviceId !== oldPrefs.microphoneDeviceId
      ) {
        try {
          const { localAudioService } = await import("../../services/on-device");
          if (localAudioService.isActive()) {
            monitoringLogger.info(
              `Mic preference changed mid-session: "${oldPrefs.microphoneDeviceId ?? "default"}" → "${prefs.microphoneDeviceId ?? "default"}"`
            );
            const switchResult = await localAudioService.switchMicrophone(prefs.microphoneDeviceId);
            if (!switchResult.success) {
              monitoringLogger.error("Mid-session mic switch failed");
            }
          }
        } catch (err) {
          monitoringLogger.error("Error during mid-session mic switch:", err);
        }
      }

      return result;
    }
  );

  // Theme / appearance preference
  ipcMain.handle(IPC_CHANNELS.THEME_GET, () => {
    return preferencesService.getTheme();
  });

  ipcMain.handle(IPC_CHANNELS.THEME_SET, (_, theme: "dark" | "light" | "system") => {
    nativeTheme.themeSource = theme;
    preferencesService.setTheme(theme);
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.THEME_CHANGED, theme);
      }
    }
    return { success: true };
  });

  // Pill display mode preference — persisted to local PGlite
  ipcMain.handle(IPC_CHANNELS.PILL_DISPLAY_MODE_GET, async (_, userId: string) => {
    const stored = await pgDb.getUserPreference(userId, "pillDisplayMode");
    return (stored === "expanded" ? "expanded" : "compact") as "compact" | "expanded";
  });

  ipcMain.handle(
    IPC_CHANNELS.PILL_DISPLAY_MODE_SET,
    async (_, userId: string, mode: "compact" | "expanded") => {
      await pgDb.setUserPreference(userId, "pillDisplayMode", mode);
      const allWindows = BrowserWindow.getAllWindows();
      for (const win of allWindows) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.PILL_DISPLAY_MODE_CHANGED, mode);
        }
      }
      return { success: true };
    }
  );

  // End session fully
  ipcMain.handle(IPC_CHANNELS.END_SESSION_FULL, async () => {
    monitoringLogger.info(" End session requested");
    ctx.audioActiveBeforePause = false;
    ctx.audioCleanupDone = true;
    audioWebSocketService.disconnect();
    if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      ctx.watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
    }

    const result = await monitoringSessionService.endSession();

    if (!result.success || !result.sessionId) {
      return result;
    }

    if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      ctx.watchingPillWindow.hide();
    }

    return result;
  });

  // Get recent sessions for doc generation dropdown
  ipcMain.handle("get-recent-sessions", async () => {
    try {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const sessions = await pgDb.getAllSessionsByDateRange(thirtyDaysAgo, now);

      return sessions
        .filter((s) => s.status !== "active" && s.status !== "paused")
        .slice(0, 20)
        .map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          captureCount: 0, // Will be populated if needed
          duration: s.endedAt ? s.endedAt - s.startedAt - (s.totalPausedMs ?? 0) : 0,
        }));
    } catch (err) {
      monitoringLogger.error("Failed to get recent sessions:", String(err));
      return [];
    }
  });

  ipcLogger.info(" Monitoring session handlers registered successfully");
}
