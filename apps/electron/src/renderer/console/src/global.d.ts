// Global type declarations for Electron preload API

import type {
  MultiWindowCaptureResult,
  MonitoringSessionState,
  SelectedWindowInfo,
  WatchableWindow,
} from "@mitable/shared";

interface ConsoleAPI {
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
  onNavigateToChat: (callback: (conversationId: string) => void) => void;

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void) => void;

  // Active session navigation (from native notification click)
  onNavigateToActiveSession: (callback: () => void) => void;

  // Auth management
  setAuthTokens: (accessToken: string, refreshToken: string) => void;
  clearAuthTokens: () => void;
  onAuthTokenUpdated: (callback: (token: string | null) => void) => void;

  // User context - share userId/orgId with main process for cross-window access
  setCurrentUser: (user: { userId: string; organizationId: string }) => void;

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
}

declare global {
  interface Window {
    consoleAPI: ConsoleAPI;
  }
}

export {};
