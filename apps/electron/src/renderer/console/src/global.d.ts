// Global type declarations for Electron preload API

import type {
  MultiWindowCaptureResult,
  MonitoringSessionState,
  SelectedWindowInfo,
  WatchableWindow,
} from "@mitable/shared";

interface ConsoleAPI {
  // Help system
  requestHelp: (data: unknown) => void;
  onHelpResponse: (callback: (data: unknown) => void) => void;

  // Screenshot capture - multi-window capture with policy filtering
  captureScreenshot: () => Promise<MultiWindowCaptureResult>;

  // Get all visible windows for monitoring session selection
  getVisibleWindows: () => Promise<{
    success: boolean;
    windows: WatchableWindow[];
    error?: string;
  }>;

  // Guide system
  startGuide: (data: unknown) => void;
  onGuideData: (callback: (data: unknown) => void) => void;

  // Conversation management
  newConversation: () => void;
  loadConversation: (id: string) => void;
  sendToAgent: (conversationId: string) => void; // Legacy: Send to old Agent window
  sendToAgentPanel: (conversationId: string) => void; // NEW: Send to Agent Panel

  // Window management
  minimizeWindow: () => void;

  // Navigation
  onNavigateToChat: (callback: (conversationId: string) => void) => void;

  // Nudge creator
  onNudgeOpenCreator: (callback: (data: unknown) => void) => void;

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void) => void;

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
  onMonitoringSessionUpdate: (callback: (state: MonitoringSessionState | null) => void) => void;
  onMonitoringCaptureProgress: (
    callback: (progress: {
      sessionId: string;
      captureCount: number;
      latestCapture: unknown;
    }) => void
  ) => void;
}

declare global {
  interface Window {
    consoleAPI: ConsoleAPI;
  }
}

export {};
