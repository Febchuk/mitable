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

// Buffer for offline user event — main process may push before React mounts
type OfflineUserPayload = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  organizationName: string;
  avatarUrl: string | null;
};
let pendingOfflineUser: OfflineUserPayload | null = null;

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
  MONITORING_SESSION_DELETE: "monitoring-session-delete",
  MONITORING_RESYNC_LOCAL: "monitoring-resync-local",
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
  AUTO_RECAP_GET: "auto-recap-get",
  AUTO_RECAP_SET: "auto-recap-set",
  AGENT_ENABLED_GET: "agent-enabled-get",
  AGENT_ENABLED_SET: "agent-enabled-set",
  PILL_DISPLAY_MODE_GET: "pill-display-mode-get",
  PILL_DISPLAY_MODE_SET: "pill-display-mode-set",
  THEME_GET: "theme-get",
  THEME_SET: "theme-set",
  THEME_CHANGED: "theme-changed",
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
  END_SESSION_FULL: "end-session-full",
  // Watching pill
  WATCHING_PILL_HIDE: "watching-pill-hide",
  // Auth session restore (main → renderer on startup)
  AUTH_SESSION_RESTORED: "auth-session-restored",
  // Native notifications
  NOTIFICATION_SHOW: "notification-show",
  // Passive monitoring
  PASSIVE_MONITORING_SET_ENABLED: "passive-monitoring-set-enabled",
  PASSIVE_MONITORING_GET_STATE: "passive-monitoring-get-state",
  PASSIVE_MONITORING_STATE_UPDATE: "passive-monitoring-state-update",
  // PDF Export
  EXPORT_PDF: "export-pdf",
  // Recap Notifications
  SHOW_RECAP_NOTIFICATION: "show-recap-notification",
  // Update Navigation
  NAVIGATE_TO_UPDATE: "navigate-to-update",
  // Agent system
  AGENT_SEND_MESSAGE: "agent-send-message",
  AGENT_MESSAGE_EVENT: "agent-message-event",
  AGENT_CANCEL: "agent-cancel",
  AGENT_APPROVE_PLAN: "agent-approve-plan",
  // Browser Bridge
  BROWSER_BRIDGE_STATUS: "browser-bridge-status",
  BROWSER_BRIDGE_GET_INFO: "browser-bridge-get-info",
  BROWSER_BRIDGE_CONNECTION_UPDATE: "browser-bridge-connection-update",
  // Permissions
  PERMISSIONS_GET_STATUS: "permissions:get-status",
  PERMISSIONS_REQUEST_ACCESSIBILITY: "permissions:request-accessibility",
  PERMISSIONS_OPEN_SCREEN_RECORDING: "permissions:open-screen-recording",
  // Feedback
  FEEDBACK_GET_LOGS: "feedback:get-logs",
  FEEDBACK_APPEND_RENDERER_LOG: "feedback:append-renderer-log",
  // On-Device AI
  ON_DEVICE_GET_STATUS: "on-device:get-status",
  ON_DEVICE_GET_PLATFORM: "on-device:get-platform",
  ON_DEVICE_GET_DOWNLOAD_SUMMARY: "on-device:get-download-summary",
  ON_DEVICE_DOWNLOAD_ASSET: "on-device:download-asset",
  ON_DEVICE_DOWNLOAD_ALL: "on-device:download-all",
  ON_DEVICE_REMOVE_ALL: "on-device:remove-all",
  ON_DEVICE_REMOVE_ASSET: "on-device:remove-asset",
  ON_DEVICE_START_SERVER: "on-device:start-server",
  ON_DEVICE_STOP_SERVER: "on-device:stop-server",
  ON_DEVICE_SERVER_STATUS: "on-device:server-status",
  ON_DEVICE_DOWNLOAD_PROGRESS: "on-device:download-progress",
  ON_DEVICE_GET_SYSTEM_INFO: "on-device:get-system-info",
  ON_DEVICE_SET_GPU_PREFERENCE: "on-device:set-gpu-preference",
  ON_DEVICE_GET_GPU_PREFERENCE: "on-device:get-gpu-preference",
  ON_DEVICE_PIPELINE_PROGRESS: "on-device:pipeline-progress",
  ON_DEVICE_READINESS_UPDATE: "on-device:readiness-update",
  ON_DEVICE_NOT_READY: "on-device:not-ready",
  // Offline auth (main → renderer)
  AUTH_OFFLINE_USER: "auth-offline-user",
} as const;

// Buffer offline user events that arrive before React mounts its listener
ipcRenderer.on(IPC_CHANNELS.AUTH_OFFLINE_USER, (_event, user: OfflineUserPayload) => {
  logger.info(" Buffered offline user event (React not mounted yet)");
  pendingOfflineUser = user;
});

contextBridge.exposeInMainWorld("consoleAPI", {
  // PDF Export
  exportPdf: async (
    html: string,
    title: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PDF, { html, title });
  },

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
  onNavigateToChat: (callback: (conversationId: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, conversationId: string) => callback(conversationId);
    ipcRenderer.on("navigate-to-chat", handler);
    return () => ipcRenderer.removeListener("navigate-to-chat", handler);
  },

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, draftId: string) => {
      logger.info(" Drafts navigate received:", draftId);
      callback(draftId);
    };
    ipcRenderer.on(IPC_CHANNELS.DRAFTS_NAVIGATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DRAFTS_NAVIGATE, handler);
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

  // Offline user - main process pushes cached user profile when backend is unreachable.
  // Replays any buffered event that arrived before React mounted its listener.
  onOfflineUser: (callback: (user: OfflineUserPayload) => void): (() => void) => {
    // Replay buffered event that arrived before this listener was attached
    if (pendingOfflineUser) {
      logger.info(" Replaying buffered offline user to React listener");
      const buffered = pendingOfflineUser;
      pendingOfflineUser = null;
      queueMicrotask(() => callback(buffered));
    }

    const handler = (_event: IpcRendererEvent, user: OfflineUserPayload) => {
      logger.info("Offline user identity received from main process");
      pendingOfflineUser = null;
      callback(user);
    };
    ipcRenderer.on(IPC_CHANNELS.AUTH_OFFLINE_USER, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_OFFLINE_USER, handler);
  },

  // User context - Share userId/orgId with main process for cross-window access
  setCurrentUser: (user: {
    userId: string;
    organizationId: string;
    role?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    jobTitle?: string;
    organizationName?: string;
    organizationDomain?: string;
  }) => ipcRenderer.send(IPC_CHANNELS.USER_CONTEXT_SET, user),

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

  deleteMonitoringSession: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_DELETE, sessionId),

  resyncLocalStories: (): Promise<{
    success: boolean;
    synced?: number;
    total?: number;
    errors?: string[];
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.MONITORING_RESYNC_LOCAL),

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
  onNavigateToActiveSession: (callback: () => void): (() => void) => {
    const handler = () => {
      logger.info(" Navigate to active session received");
      callback();
    };
    ipcRenderer.on(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION, handler);
  },

  // Navigation - Navigate to recaps page (from recap-ready notification)
  onNavigateToRecaps: (callback: () => void): (() => void) => {
    const handler = () => {
      logger.info(" Navigate to recaps received");
      callback();
    };
    ipcRenderer.on("navigate-to-recaps", handler);
    return () => ipcRenderer.removeListener("navigate-to-recaps", handler);
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

  // Auto recap API (user-scoped)
  getAutoRecap: (userId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTO_RECAP_GET, userId),

  setAutoRecap: (userId: string, enabled: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTO_RECAP_SET, userId, enabled),

  // Pill display mode API (user-scoped)
  getPillDisplayMode: (userId: string): Promise<"compact" | "expanded"> =>
    ipcRenderer.invoke(IPC_CHANNELS.PILL_DISPLAY_MODE_GET, userId),

  setPillDisplayMode: (
    userId: string,
    mode: "compact" | "expanded"
  ): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PILL_DISPLAY_MODE_SET, userId, mode),

  // Theme / appearance API
  getTheme: (): Promise<"dark" | "light" | "system"> => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET),

  setTheme: (theme: "dark" | "light" | "system"): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_SET, theme),

  onThemeChanged: (callback: (theme: "dark" | "light" | "system") => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: "dark" | "light" | "system") =>
      callback(theme);
    ipcRenderer.on(IPC_CHANNELS.THEME_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.THEME_CHANGED, handler);
  },

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

  // End session fully: stop captures + upload + trigger backend summarization
  endSessionFull: (): Promise<{
    success: boolean;
    sessionId?: string;
    captureCount?: number;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.END_SESSION_FULL),

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

  // Passive monitoring
  setPassiveMonitoringEnabled: (enabled: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PASSIVE_MONITORING_SET_ENABLED, enabled),

  getPassiveMonitoringState: (): Promise<{
    state: "disabled" | "detecting" | "deferred";
    sessionId: string | null;
  }> => ipcRenderer.invoke(IPC_CHANNELS.PASSIVE_MONITORING_GET_STATE),

  onPassiveMonitoringStateUpdate: (
    callback: (state: {
      state: "disabled" | "detecting" | "deferred";
      sessionId: string | null;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      state: {
        state: "disabled" | "detecting" | "deferred";
        sessionId: string | null;
      }
    ) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.PASSIVE_MONITORING_STATE_UPDATE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PASSIVE_MONITORING_STATE_UPDATE, handler);
    };
  },

  // Show recap-ready notification (simple click-to-navigate, no protocol URLs)
  showRecapNotification: (config: {
    title: string;
    message: string;
  }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SHOW_RECAP_NOTIFICATION, config),

  // Navigation - Navigate to update/profile page (from update notification click)
  onNavigateToUpdate: (callback: () => void): (() => void) => {
    const handler = () => {
      logger.info(" Navigate to update received");
      callback();
    };
    ipcRenderer.on(IPC_CHANNELS.NAVIGATE_TO_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NAVIGATE_TO_UPDATE, handler);
  },

  // Agent feature toggle (user-scoped)
  getAgentEnabled: (userId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_ENABLED_GET, userId),

  setAgentEnabled: (userId: string, enabled: boolean): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_ENABLED_SET, userId, enabled),

  // Agent system
  agentSendMessage: (conversationId: string, message: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_SEND_MESSAGE, conversationId, message),

  agentCancel: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL),

  agentApprovePlan: (conversationId: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_APPROVE_PLAN, conversationId, approved),

  onAgentMessageEvent: (
    callback: (data: { type: string; data: unknown }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { type: string; data: unknown }) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.AGENT_MESSAGE_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_MESSAGE_EVENT, handler);
  },

  // Permissions
  getPermissionStatus: (): Promise<{
    screen: string;
    accessibility: boolean;
  }> => ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_GET_STATUS),

  requestAccessibilityPermission: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_REQUEST_ACCESSIBILITY),

  openScreenRecordingSettings: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_OPEN_SCREEN_RECORDING),

  // Browser Bridge
  getBrowserBridgeStatus: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BRIDGE_STATUS),

  getBrowserBridgeInfo: (): Promise<{
    port: number;
    token: string;
    connected: boolean;
  }> => ipcRenderer.invoke(IPC_CHANNELS.BROWSER_BRIDGE_GET_INFO),

  onBrowserBridgeConnectionUpdate: (callback: (connected: boolean) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, connected: boolean) => callback(connected);
    ipcRenderer.on(IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE, handler);
  },

  // Feedback — main.log tail + renderer.log (DevTools stream, written by main)
  appendRendererLogChunk: (chunk: string): void => {
    ipcRenderer.send(IPC_CHANNELS.FEEDBACK_APPEND_RENDERER_LOG, chunk);
  },
  getElectronLogs: (): Promise<{
    success: boolean;
    logs: string;
    rendererLogs: string;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.FEEDBACK_GET_LOGS),

  analyzeLogsLocally: (args: {
    message: string;
    mainLogs: string;
    rendererLogs: string;
  }): Promise<{ success: boolean; analysis: string; error?: string }> =>
    ipcRenderer.invoke("feedback:analyze-logs", args),

  submitFeedback: (args: {
    message: string;
    logAnalysis: string;
    ollamaDiagnostics: string;
    mainLogs: string;
    rendererLogs: string;
    userName: string;
    userEmail: string;
    token: string | null;
    apiBaseUrl: string;
    isAnonymous: boolean;
  }): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke("feedback:submit", args),

  // On-Device AI
  onDeviceGetStatus: (): Promise<{
    isSetUp: boolean;
    serverStatus: string;
    model: string | null;
    tier: string | null;
    gpuDescription: string;
    vramMB: number;
    hasNativeAudio: boolean;
    enabled: boolean;
    onDeviceAllowed: boolean;
    onDeviceBlockReason: string | null;
    sqliteAvailable: boolean;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_GET_STATUS),

  onDeviceGetPlatform: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_GET_PLATFORM),

  onDeviceGetSystemInfo: (): Promise<{
    cpu: string;
    ramMB: number;
    os: string;
    gpus: Array<{
      name: string;
      vramMB: number;
      type: "dedicated" | "integrated";
      vendor: "nvidia" | "amd" | "intel" | "apple" | "unknown";
    }>;
    platform: string;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_GET_SYSTEM_INFO),

  onDeviceGetGpuPreference: (userId: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_GET_GPU_PREFERENCE, userId),

  onDeviceSetGpuPreference: (
    userId: string,
    gpuName: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_SET_GPU_PREFERENCE, userId, gpuName),

  onDeviceGetDownloadSummary: (): Promise<{
    assets: Array<{ id: string; label: string; description: string; sizeBytes: number }>;
    totalBytes: number;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_GET_DOWNLOAD_SUMMARY),

  onDeviceDownloadAsset: (assetId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_ASSET, assetId),

  onDeviceDownloadAll: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_ALL),

  onDeviceRemoveAll: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_REMOVE_ALL),

  onDeviceRemoveAsset: (assetId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_REMOVE_ASSET, assetId),

  onDeviceStartServer: (): Promise<{
    success: boolean;
    model?: string;
    tier?: string;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_START_SERVER),

  onDeviceStopServer: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_STOP_SERVER),

  onDeviceServerStatus: (): Promise<{
    status: string;
    model: string | null;
    tier: string | null;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.ON_DEVICE_SERVER_STATUS),

  onDeviceDownloadProgress: (
    callback: (progress: {
      assetId: string;
      label: string;
      phase: string;
      bytesDownloaded: number;
      totalBytes: number;
      percent: number;
      error?: string;
    }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_PROGRESS, handler);
  },

  onPipelineProgress: (
    callback: (progress: {
      sessionId: string;
      step: string;
      batchIndex?: number;
      totalBatches?: number;
      percent: number;
      label: string;
    }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.ON_DEVICE_PIPELINE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_DEVICE_PIPELINE_PROGRESS, handler);
  },

  onDeviceReadinessUpdate: (
    callback: (data: { ready: boolean; error?: string }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ON_DEVICE_READINESS_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_DEVICE_READINESS_UPDATE, handler);
  },

  onDeviceNotReady: (
    callback: (data: { sessionId: string; message: string }) => void
  ): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ON_DEVICE_NOT_READY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_DEVICE_NOT_READY, handler);
  },

  getBlockExportPath: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke("get-block-export-path", sessionId),

  getBlockExportContent: (sessionId: string): Promise<{ content: string; path: string } | null> =>
    ipcRenderer.invoke("get-block-export-content", sessionId),

  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke("copy-to-clipboard", text),

  copyFileToClipboard: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("copy-file-to-clipboard", filePath),

  // Local-first data access
  getLocalCalendarDays: (startMs: number, endMs: number): Promise<unknown[]> =>
    ipcRenderer.invoke("get-local-calendar-days", startMs, endMs),

  getLocalSessionDetail: (sessionId: string): Promise<unknown> =>
    ipcRenderer.invoke("get-local-session-detail", sessionId),
});

logger.info(" Console preload script finished - window.consoleAPI exposed");
