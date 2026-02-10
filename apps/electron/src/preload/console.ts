import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  MultiWindowCaptureResult,
  MonitoringSessionState,
  SelectedWindowInfo,
  WatchableWindow,
} from "@mitable/shared";

// Simple logger for preload - console.log outputs to DevTools
// Note: electron-log/preload doesn't work well when bundled, so using plain console
const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[ConsolePreload]${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[ConsolePreload]${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ConsolePreload]${msg}`, ...args),
};

logger.info(" Preload script starting...");

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  CAPTURE_SCREENSHOT: "capture-screenshot",
  CONSOLE_MINIMIZE: "console-minimize",
  AUTH_SET_TOKENS: "auth-set-tokens",
  AUTH_CLEAR: "auth-clear",
  AUTH_TOKEN_UPDATED: "auth-token-updated",
  USER_CONTEXT_SET: "user-context-set",
  DRAFTS_NAVIGATE: "drafts-navigate", // Update Buddy: Navigate to draft detail
  // Monitoring session channels
  MONITORING_SESSION_START: "monitoring-session-start",
  MONITORING_SESSION_PAUSE: "monitoring-session-pause",
  MONITORING_SESSION_RESUME: "monitoring-session-resume",
  MONITORING_SESSION_END: "monitoring-session-end",
  MONITORING_SESSION_RESET: "monitoring-session-reset",
  MONITORING_SESSION_STATUS: "monitoring-session-status",
  MONITORING_SESSION_UPDATE: "monitoring-session-update",
  MONITORING_CAPTURE_PROGRESS: "monitoring-capture-progress",
  // Window detection
  WATCH_WINDOWS_GET_ALL: "watch-windows-get-all",
  // Session Recovery
  SESSION_GET_RECOVERABLE: "session-get-recoverable",
  SESSION_RECOVER: "session-recover",
  SESSION_DISCARD: "session-discard",
  SESSION_SHOW_RECOVERY_DIALOG: "session-show-recovery-dialog",
  // Navigation
  NAVIGATE_TO_ACTIVE_SESSION: "navigate-to-active-session",
  NAVIGATE_TO_SESSION_DETAIL: "navigate-to-session-detail",
  // Preferences
  PREFERENCES_GET: "preferences-get",
  PREFERENCES_SET: "preferences-set",
  PREFERENCES_GET_ALL: "preferences-get-all",
  // Block list
  BLOCK_LIST_GET: "block-list-get",
  BLOCK_LIST_SET: "block-list-set",
  BLOCK_LIST_ADD: "block-list-add",
  BLOCK_LIST_REMOVE: "block-list-remove",
  BLOCK_LIST_GET_DETECTED_APPS: "block-list-get-detected-apps",
  BLOCK_LIST_GET_ALL_APPS: "block-list-get-all-apps",
  BLOCK_LIST_REFRESH_INSTALLED_APPS: "block-list-refresh-installed-apps",
  NOTIFICATION_FREQUENCY_GET: "notification-frequency-get",
  NOTIFICATION_FREQUENCY_SET: "notification-frequency-set",
  AUTO_SESSION_START_GET: "auto-session-start-get",
  AUTO_SESSION_START_SET: "auto-session-start-set",
  // Summary preferences
  SUMMARY_PREFERENCES_GET: "summary-preferences-get",
  SUMMARY_PREFERENCES_SET: "summary-preferences-set",
  SUMMARY_DEFAULTS_GET: "summary-defaults-get",
  SUMMARY_DEFAULTS_SET: "summary-defaults-set",
  ALWAYS_ASK_ON_SESSION_END_GET: "always-ask-on-session-end-get",
  ALWAYS_ASK_ON_SESSION_END_SET: "always-ask-on-session-end-set",
  // Audio preferences
  AUDIO_DEVICES_ENUMERATE: "audio-devices-enumerate",
  AUDIO_PREFERENCES_GET: "audio-preferences-get",
  AUDIO_PREFERENCES_SET: "audio-preferences-set",
  AUDIO_TEST_START: "audio-test-start",
  AUDIO_TEST_STOP: "audio-test-stop",
  // End session dialog coordination
  SHOW_END_SESSION_DIALOG: "show-end-session-dialog",
  END_SESSION_WITH_PREFERENCES: "end-session-with-preferences",
  // Watching pill
  WATCHING_PILL_HIDE: "watching-pill-hide",
  // Auth session restore (main → renderer on startup)
  AUTH_SESSION_RESTORED: "auth-session-restored",
  // Native notifications
  NOTIFICATION_SHOW: "notification-show",
} as const;

contextBridge.exposeInMainWorld("consoleAPI", {
  // Screenshot capture - multi-window capture with policy filtering
  captureScreenshot: async (): Promise<MultiWindowCaptureResult> => {
    logger.info(" Multi-window captureScreenshot() called from renderer");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT);

    if (result && result.success) {
      logger.info(" Multi-window capture successful:", {
        screenshotCount: result.screenshots.length,
        blockedCount: result.blockedWindows.length,
        totalDetected: result.totalWindowsDetected,
      });
    } else if (result && !result.success) {
      logger.warn(" Capture blocked or failed:", result.error);
    }

    return result;
  },

  // Get all visible windows for monitoring session selection
  getVisibleWindows: async (): Promise<{
    success: boolean;
    windows: WatchableWindow[];
    error?: string;
  }> => {
    logger.info(" getVisibleWindows() called");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_GET_ALL);
    logger.info(" getVisibleWindows result:", {
      success: result?.success,
      windowCount: result?.windows?.length ?? 0,
    });
    return result;
  },

  // Window management
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.CONSOLE_MINIMIZE),

  // Navigation - Listen for navigation requests from main process
  onNavigateToChat: (callback: (conversationId: string) => void) => {
    ipcRenderer.on("navigate-to-chat", (_event: IpcRendererEvent, conversationId: string) =>
      callback(conversationId)
    );
  },

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.DRAFTS_NAVIGATE, (_event: IpcRendererEvent, draftId: string) => {
      logger.info(" Drafts navigate received:", draftId);
      callback(draftId);
    });
  },

  // Auth management - Console sends tokens to main process after login
  setAuthTokens: (accessToken: string, refreshToken: string) =>
    ipcRenderer.send(IPC_CHANNELS.AUTH_SET_TOKENS, accessToken, refreshToken),
  clearAuthTokens: () => ipcRenderer.send(IPC_CHANNELS.AUTH_CLEAR),
  onAuthTokenUpdated: (callback: (token: string | null) => void) => {
    ipcRenderer.on(
      IPC_CHANNELS.AUTH_TOKEN_UPDATED,
      (_event: IpcRendererEvent, token: string | null) => callback(token)
    );
  },
  // Auth session restore - main process pushes tokens recovered from OS keychain on startup
  onSessionRestored: (
    callback: (tokens: { accessToken: string; refreshToken: string }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      tokens: { accessToken: string; refreshToken: string }
    ) => {
      logger.info(" Session restored from keychain, tokens received");
      callback(tokens);
    };
    ipcRenderer.on(IPC_CHANNELS.AUTH_SESSION_RESTORED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_SESSION_RESTORED, handler);
  },

  // User context - Share userId/orgId with main process for cross-window access
  setCurrentUser: (user: { userId: string; organizationId: string }) =>
    ipcRenderer.send(IPC_CHANNELS.USER_CONTEXT_SET, user),

  // Monitoring session management
  startMonitoringSession: (config: {
    sessionId: string; // Backend's session ID - ensures Electron uses same ID
    selectedWindows: SelectedWindowInfo[];
    captureIntervalMs: number;
    name?: string;
    userId: string;
    organizationId: string;
  }): Promise<{ sessionId: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_START, config),

  pauseMonitoringSession: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_PAUSE),

  resumeMonitoringSession: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_RESUME),

  endMonitoringSession: (): Promise<{
    success: boolean;
    sessionId?: string;
    captureCount?: number;
    captures?: Array<{
      sequenceNumber: number;
      captureTrigger: "periodic" | "focus_change" | "manual";
      capturedAt: number;
      windowId?: string;
      appName?: string;
      windowTitle?: string;
      screenshotPath?: string;
      screenshotHash?: string;
      imageData?: string;
    }>;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_END),

  resetMonitoringSession: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_RESET),

  getMonitoringSessionState: (): Promise<MonitoringSessionState | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_STATUS),

  onMonitoringSessionUpdate: (
    callback: (state: MonitoringSessionState | null) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: MonitoringSessionState | null) =>
      callback(state);
    ipcRenderer.on(IPC_CHANNELS.MONITORING_SESSION_UPDATE, handler);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MONITORING_SESSION_UPDATE, handler);
    };
  },

  onMonitoringCaptureProgress: (
    callback: (progress: {
      sessionId: string;
      captureCount: number;
      latestCapture: unknown;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      progress: { sessionId: string; captureCount: number; latestCapture: unknown }
    ) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.MONITORING_CAPTURE_PROGRESS, handler);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MONITORING_CAPTURE_PROGRESS, handler);
    };
  },

  // Session Recovery
  getRecoverableSessions: (): Promise<
    Array<{
      sessionId: string;
      frameCount: number;
      lastCheckpoint: string;
      status: string;
    }>
  > => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_RECOVERABLE),

  recoverSession: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_RECOVER, sessionId),

  discardRecoverableSession: (sessionId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_DISCARD, sessionId),

  onShowRecoveryDialog: (
    callback: (
      sessions: Array<{
        sessionId: string;
        frameCount: number;
        lastCheckpoint: string;
        status: string;
      }>
    ) => void
  ) => {
    ipcRenderer.on(
      IPC_CHANNELS.SESSION_SHOW_RECOVERY_DIALOG,
      (
        _event: IpcRendererEvent,
        sessions: Array<{
          sessionId: string;
          frameCount: number;
          lastCheckpoint: string;
          status: string;
        }>
      ) => callback(sessions)
    );
  },

  // Navigation - Navigate to active monitoring session
  onNavigateToActiveSession: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION, () => {
      logger.info(" Navigate to active session received");
      callback();
    });
  },

  // Navigation - Navigate to a specific session detail with optional flags
  onNavigateToSessionDetail: (
    callback: (payload: {
      sessionId: string;
      openEndDialog?: boolean;
      showSummaryToast?: boolean;
    }) => void
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      payload: { sessionId: string; openEndDialog?: boolean; showSummaryToast?: boolean }
    ) => {
      logger.info(" Navigate to session detail received", payload);
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.NAVIGATE_TO_SESSION_DETAIL, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NAVIGATE_TO_SESSION_DETAIL, handler);
  },

  // Update notifications
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: (): Promise<{ success: boolean }> => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("download-update"),
  installUpdate: (): Promise<{ success: boolean }> => ipcRenderer.invoke("install-update"),

  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      info: { version: string; releaseNotes?: string; releaseDate?: string }
    ) => callback(info);
    ipcRenderer.on("update-available", handler);
    return () => {
      ipcRenderer.removeListener("update-available", handler);
    };
  },

  onUpdateDownloadProgress: (
    callback: (progress: { percent: number; transferred: number; total: number }) => void
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      progress: { percent: number; transferred: number; total: number }
    ) => callback(progress);
    ipcRenderer.on("update-download-progress", handler);
    return () => {
      ipcRenderer.removeListener("update-download-progress", handler);
    };
  },

  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on("update-downloaded", handler);
    return () => {
      ipcRenderer.removeListener("update-downloaded", handler);
    };
  },

  onUpdateError: (callback: (error: { message: string }) => void) => {
    const handler = (_event: IpcRendererEvent, error: { message: string }) => callback(error);
    ipcRenderer.on("update-error", handler);
    return () => {
      ipcRenderer.removeListener("update-error", handler);
    };
  },

  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on("update-not-available", handler);
    return () => {
      ipcRenderer.removeListener("update-not-available", handler);
    };
  },

  // Preferences API
  getPreference: (key: string): Promise<boolean | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_GET, key),

  setPreference: (key: string, value: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_SET, key, value),

  getAllPreferences: (): Promise<{
    session: {
      hidePillOnSessionEnd: boolean;
      dontAskHidePillAgain: boolean;
      showPillOnSessionStart: boolean;
    };
  }> => ipcRenderer.invoke(IPC_CHANNELS.PREFERENCES_GET_ALL),

  // Block list API (user-scoped)
  getBlockList: (userId: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_GET, userId),

  setBlockList: (userId: string, blockedApps: string[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_SET, userId, blockedApps),

  addBlockedApp: (userId: string, appName: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_ADD, userId, appName),

  removeBlockedApp: (userId: string, appName: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_REMOVE, userId, appName),

  getDetectedApps: (): Promise<Array<{ normalizedName: string; originalName: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_GET_DETECTED_APPS),

  // Get all blockable apps (detected + installed)
  getAllBlockableApps: (
    forceRefresh?: boolean
  ): Promise<{
    success: boolean;
    apps: Array<{
      normalizedName: string;
      originalName: string;
      source: "detected" | "installed" | "both";
    }>;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_GET_ALL_APPS, forceRefresh),

  // Refresh installed apps cache
  refreshInstalledApps: (): Promise<{
    success: boolean;
    apps: Array<{
      normalizedName: string;
      originalName: string;
      source: "detected" | "installed" | "both";
    }>;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.BLOCK_LIST_REFRESH_INSTALLED_APPS),

  // Notification frequency API (user-scoped)
  getNotificationFrequency: (userId: string): Promise<number> =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_FREQUENCY_GET, userId),

  setNotificationFrequency: (userId: string, minutes: number): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_FREQUENCY_SET, userId, minutes),

  // Auto session start API (user-scoped)
  getAutoSessionStart: (userId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTO_SESSION_START_GET, userId),

  setAutoSessionStart: (userId: string, enabled: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTO_SESSION_START_SET, userId, enabled),

  // Summary preferences API
  getSummaryPreferences: (): Promise<{
    detailLevel: "concise" | "verbose";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
    alwaysAskOnSessionEnd: boolean;
  }> => ipcRenderer.invoke(IPC_CHANNELS.SUMMARY_PREFERENCES_GET),

  setSummaryPreferences: (prefs: {
    detailLevel?: "concise" | "verbose";
    format?: "bullets" | "paragraphs";
    includeScreenshots?: boolean;
    alwaysAskOnSessionEnd?: boolean;
  }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SUMMARY_PREFERENCES_SET, prefs),

  getSummaryDefaults: (): Promise<{
    detailLevel: "concise" | "verbose";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }> => ipcRenderer.invoke(IPC_CHANNELS.SUMMARY_DEFAULTS_GET),

  setSummaryDefaults: (defaults: {
    detailLevel?: "concise" | "verbose";
    format?: "bullets" | "paragraphs";
    includeScreenshots?: boolean;
  }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SUMMARY_DEFAULTS_SET, defaults),

  getAlwaysAskOnSessionEnd: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.ALWAYS_ASK_ON_SESSION_END_GET),

  setAlwaysAskOnSessionEnd: (value: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ALWAYS_ASK_ON_SESSION_END_SET, value),

  // Audio preferences
  enumerateAudioDevices: (): Promise<{
    success: boolean;
    devices: Array<{ deviceId: string; label: string; groupId: string }>;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_DEVICES_ENUMERATE),

  getAudioPreferences: (): Promise<{
    microphoneDeviceId: string | null;
    systemAudioEnabled: boolean;
  }> => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_PREFERENCES_GET),

  setAudioPreferences: (prefs: {
    microphoneDeviceId?: string | null;
    systemAudioEnabled?: boolean;
  }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_PREFERENCES_SET, prefs),

  // End session with preferences (called from Console after dialog confirmation)
  endSessionWithPreferences: (preferences: {
    detailLevel: "concise" | "verbose";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }): Promise<{
    success: boolean;
    sessionId?: string;
    captureCount?: number;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.END_SESSION_WITH_PREFERENCES, preferences),

  // Listen for show end session dialog event (triggered from pill)
  onShowEndSessionDialog: (callback: () => void): (() => void) => {
    const handler = () => {
      logger.info(" Show end session dialog event received from pill");
      callback();
    };
    ipcRenderer.on(IPC_CHANNELS.SHOW_END_SESSION_DIALOG, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SHOW_END_SESSION_DIALOG, handler);
    };
  },

  // Hide watching pill
  hidePill: () => ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE),

  // Show native notification (outside the app window)
  showNotification: (config: {
    title: string;
    message: string;
    actions: Array<{ id: string; label: string; primary?: boolean }>;
    timeout?: number;
  }): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SHOW, config),
});

logger.info(" Console preload script finished - window.consoleAPI exposed");
