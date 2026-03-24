// Global type declarations for Electron preload API

import type {
  MultiWindowCaptureResult,
  MonitoringSessionState,
  SelectedWindowInfo,
  WatchableWindow,
} from "@mitable/shared";

interface ConsoleAPI {
  // PDF Export
  exportPdf: (
    html: string,
    title: string
  ) => Promise<{ success: boolean; filePath?: string; error?: string }>;

  // Screenshot capture - multi-window capture with policy filtering
  captureScreenshot: () => Promise<MultiWindowCaptureResult>;

  // Get all visible windows for monitoring session selection
  getVisibleWindows: () => Promise<{
    success: boolean;
    windows: WatchableWindow[];
    error?: string;
  }>;

  // Window management
  minimizeWindow: () => void;

  // Navigation
  onNavigateToChat: (callback: (conversationId: string) => void) => () => void;

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void) => () => void;

  // Active session navigation (from native notification click)
  onNavigateToActiveSession: (callback: () => void) => () => void;

  // Recaps navigation (from recap-ready notification click)
  onNavigateToRecaps: (callback: () => void) => () => void;

  // Navigate to a specific session detail with optional flags
  onNavigateToSessionDetail: (
    callback: (payload: {
      sessionId: string;
      openEndDialog?: boolean;
      showSummaryToast?: boolean;
    }) => void
  ) => () => void;

  // Auth management
  setAuthTokens: (accessToken: string, refreshToken: string) => void;
  clearAuthTokens: () => void;
  onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
  // Auth session restore - main process pushes tokens recovered from OS keychain on startup
  onSessionRestored: (
    callback: (tokens: { accessToken: string; refreshToken: string }) => void
  ) => (() => void) | undefined;

  // User context - share userId/orgId with main process for cross-window access
  setCurrentUser: (user: { userId: string; organizationId: string; role?: string }) => void;

  // Monitoring session management
  startMonitoringSession: (config: {
    sessionId: string; // Backend's session ID - ensures Electron uses same ID
    selectedWindows: SelectedWindowInfo[];
    captureIntervalMs: number;
    name?: string;
    userId: string;
    organizationId: string;
  }) => Promise<{ sessionId: string; error?: string }>;
  pauseMonitoringSession: () => Promise<{ success: boolean; error?: string }>;
  resumeMonitoringSession: () => Promise<{ success: boolean; error?: string }>;
  endMonitoringSession: () => Promise<{
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
  }>;
  resetMonitoringSession: () => Promise<{ success: boolean }>;
  getMonitoringSessionState: () => Promise<MonitoringSessionState | null>;
  onMonitoringSessionUpdate: (
    callback: (state: MonitoringSessionState | null) => void
  ) => () => void;
  onMonitoringCaptureProgress: (
    callback: (progress: {
      sessionId: string;
      captureCount: number;
      latestCapture: unknown;
    }) => void
  ) => () => void;

  // Session Recovery
  getRecoverableSessions: () => Promise<
    Array<{
      sessionId: string;
      frameCount: number;
      lastCheckpoint: string;
      status: string;
    }>
  >;
  recoverSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  discardRecoverableSession: (sessionId: string) => Promise<{ success: boolean }>;
  onShowRecoveryDialog: (
    callback: (
      sessions: Array<{
        sessionId: string;
        frameCount: number;
        lastCheckpoint: string;
        status: string;
      }>
    ) => void
  ) => void;

  // Update notifications
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ success: boolean }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => Promise<{ success: boolean }>;
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void
  ) => () => void;
  onUpdateDownloadProgress: (
    callback: (progress: { percent: number; transferred: number; total: number }) => void
  ) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void;

  // Preferences API
  getPreference: (key: string) => Promise<boolean | null>;
  setPreference: (key: string, value: boolean) => Promise<{ success: boolean; error?: string }>;
  getAllPreferences: () => Promise<{
    session: {
      hidePillOnSessionEnd: boolean;
      dontAskHidePillAgain: boolean;
      showPillOnSessionStart: boolean;
    };
  }>;

  // Block list API (user-scoped)
  getBlockList: (userId: string) => Promise<string[]>;
  setBlockList: (userId: string, blockedApps: string[]) => Promise<{ success: boolean }>;
  addBlockedApp: (userId: string, appName: string) => Promise<{ success: boolean }>;
  removeBlockedApp: (userId: string, appName: string) => Promise<{ success: boolean }>;
  getDetectedApps: () => Promise<Array<{ normalizedName: string; originalName: string }>>;
  getAllBlockableApps: (forceRefresh?: boolean) => Promise<{
    success: boolean;
    apps: Array<{
      normalizedName: string;
      originalName: string;
      source: "detected" | "installed" | "both";
    }>;
    error?: string;
  }>;
  refreshInstalledApps: () => Promise<{
    success: boolean;
    apps: Array<{
      normalizedName: string;
      originalName: string;
      source: "detected" | "installed" | "both";
    }>;
    error?: string;
  }>;

  // Notification frequency API (user-scoped)
  getNotificationFrequency: (userId: string) => Promise<number>;
  setNotificationFrequency: (userId: string, minutes: number) => Promise<{ success: boolean }>;

  // Auto session start API (user-scoped)
  getAutoSessionStart: (userId: string) => Promise<boolean>;
  setAutoSessionStart: (userId: string, enabled: boolean) => Promise<{ success: boolean }>;

  // Auto recap API (user-scoped)
  getAutoRecap: (userId: string) => Promise<boolean>;
  setAutoRecap: (userId: string, enabled: boolean) => Promise<{ success: boolean }>;

  // Pill display mode API (user-scoped)
  getPillDisplayMode: (userId: string) => Promise<"compact" | "expanded">;
  setPillDisplayMode: (
    userId: string,
    mode: "compact" | "expanded"
  ) => Promise<{ success: boolean }>;

  // Theme / appearance API
  getTheme: () => Promise<"dark" | "light" | "system">;
  setTheme: (theme: "dark" | "light" | "system") => Promise<{ success: boolean }>;
  onThemeChanged: (callback: (theme: "dark" | "light" | "system") => void) => () => void;

  // Summary preferences API
  getSummaryPreferences: () => Promise<{
    detailLevel: "concise" | "verbose";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
    alwaysAskOnSessionEnd: boolean;
  }>;
  setSummaryPreferences: (prefs: {
    detailLevel?: "concise" | "verbose";
    format?: "bullets" | "paragraphs";
    includeScreenshots?: boolean;
    alwaysAskOnSessionEnd?: boolean;
  }) => Promise<{ success: boolean }>;
  getSummaryDefaults: () => Promise<{
    detailLevel: "concise" | "verbose";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }>;
  setSummaryDefaults: (defaults: {
    detailLevel?: "concise" | "verbose";
    format?: "bullets" | "paragraphs";
    includeScreenshots?: boolean;
  }) => Promise<{ success: boolean }>;
  getAlwaysAskOnSessionEnd: () => Promise<boolean>;
  setAlwaysAskOnSessionEnd: (value: boolean) => Promise<{ success: boolean }>;

  // Audio preferences API
  enumerateAudioDevices: () => Promise<{
    success: boolean;
    devices: Array<{ deviceId: string; label: string; groupId: string }>;
    error?: string;
  }>;
  getAudioPreferences: () => Promise<{
    microphoneDeviceId: string | null;
    systemAudioEnabled: boolean;
    systemAudioOutputId: string | null;
  }>;
  setAudioPreferences: (prefs: {
    microphoneDeviceId?: string | null;
    systemAudioEnabled?: boolean;
    systemAudioOutputId?: string | null;
  }) => Promise<{ success: boolean }>;

  // End session fully: stop captures + upload + trigger backend summarization
  endSessionFull: () => Promise<{
    success: boolean;
    sessionId?: string;
    captureCount?: number;
    error?: string;
  }>;

  // Listen for external trigger to show EndSessionDialog (from pill)
  onShowEndSessionDialog: (callback: () => void) => () => void;

  // Hide watching pill
  hidePill: () => void;

  // Show native notification (outside the app window)
  showNotification: (config: {
    title: string;
    message: string;
    actions: Array<{ id: string; label: string; primary?: boolean }>;
    timeout?: number;
  }) => Promise<{ success: boolean }>;

  // Passive monitoring
  setPassiveMonitoringEnabled: (enabled: boolean) => Promise<{ success: boolean }>;
  getPassiveMonitoringState: () => Promise<{
    state: "disabled" | "detecting" | "deferred";
    sessionId: string | null;
  }>;
  onPassiveMonitoringStateUpdate: (
    callback: (state: {
      state: "disabled" | "detecting" | "deferred";
      sessionId: string | null;
    }) => void
  ) => () => void;

  // Show recap-ready notification (simple click-to-navigate, no protocol URLs)
  showRecapNotification: (config: {
    title: string;
    message: string;
  }) => Promise<{ success: boolean }>;

  // Navigation - Navigate to update/profile page (from update notification click)
  onNavigateToUpdate: (callback: () => void) => () => void;

  // Agent feature toggle (user-scoped)
  getAgentEnabled: (userId: string) => Promise<boolean>;
  setAgentEnabled: (userId: string, enabled: boolean) => Promise<{ success: boolean }>;

  // Agent system
  agentSendMessage: (conversationId: string, message: string) => Promise<void>;
  agentCancel: () => Promise<void>;
  agentApprovePlan: (conversationId: string, approved: boolean) => Promise<void>;
  onAgentMessageEvent: (callback: (data: { type: string; data: unknown }) => void) => () => void;

  // Browser Bridge (Chrome Extension)
  getBrowserBridgeStatus: () => Promise<boolean>;
  getBrowserBridgeInfo: () => Promise<{ port: number; token: string; connected: boolean }>;
  onBrowserBridgeConnectionUpdate: (callback: (connected: boolean) => void) => () => void;
}

declare global {
  interface Window {
    consoleAPI: ConsoleAPI;
  }
}

export {};
