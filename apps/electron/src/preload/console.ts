import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  MultiWindowCaptureResult,
  MonitoringSessionState,
  SelectedWindowInfo,
  WatchableWindow,
} from "@mitable/shared";

console.log("[Preload] Console preload script starting...");

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  HELP_REQUEST: "help-request",
  HELP_RESPONSE: "help-response",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  CONVERSATION_NEW: "conversation-new",
  CONVERSATION_LOAD: "conversation-load",
  AGENT_OPEN_CONVERSATION: "agent-open-conversation", // Legacy: Send conversation to Agent
  AGENTPANEL_LOAD_CONVERSATION: "agentpanel-load-conversation", // NEW: Send to Agent Panel
  CONSOLE_MINIMIZE: "console-minimize",
  NUDGE_OPEN_CREATOR: "nudge-open-creator",
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
} as const;

contextBridge.exposeInMainWorld("consoleAPI", {
  // Help system
  requestHelp: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.HELP_REQUEST, data),
  onHelpResponse: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.HELP_RESPONSE, (_event: IpcRendererEvent, data: unknown) =>
      callback(data)
    );
  },

  // Screenshot capture - multi-window capture with policy filtering
  captureScreenshot: async (): Promise<MultiWindowCaptureResult> => {
    console.log("[Console Preload] Multi-window captureScreenshot() called from renderer");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT);

    if (result && result.success) {
      console.log("[Console Preload] Multi-window capture successful:", {
        screenshotCount: result.screenshots.length,
        blockedCount: result.blockedWindows.length,
        totalDetected: result.totalWindowsDetected,
      });
    } else if (result && !result.success) {
      console.warn("[Console Preload] Capture blocked or failed:", result.error);
    }

    return result;
  },

  // Get all visible windows for monitoring session selection
  getVisibleWindows: async (): Promise<{
    success: boolean;
    windows: WatchableWindow[];
    error?: string;
  }> => {
    console.log("[Console Preload] getVisibleWindows() called");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_GET_ALL);
    console.log("[Console Preload] getVisibleWindows result:", {
      success: result?.success,
      windowCount: result?.windows?.length ?? 0,
    });
    return result;
  },

  // Conversation management
  newConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_NEW),
  loadConversation: (id: string) => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LOAD, id),
  sendToAgent: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.AGENT_OPEN_CONVERSATION, conversationId), // Legacy: Send to old Agent window
  sendToAgentPanel: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_LOAD_CONVERSATION, conversationId), // NEW: Send to Agent Panel

  // Window management
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.CONSOLE_MINIMIZE),

  // Navigation - Listen for navigation requests from main process
  onNavigateToChat: (callback: (conversationId: string) => void) => {
    ipcRenderer.on("navigate-to-chat", (_event: IpcRendererEvent, conversationId: string) =>
      callback(conversationId)
    );
  },

  // Nudge creator
  onNudgeOpenCreator: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.NUDGE_OPEN_CREATOR, (_event: IpcRendererEvent, data: unknown) =>
      callback(data)
    );
  },

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.DRAFTS_NAVIGATE, (_event: IpcRendererEvent, draftId: string) => {
      console.log("[Console Preload] Drafts navigate received:", draftId);
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

  onMonitoringSessionUpdate: (callback: (state: MonitoringSessionState | null) => void) => {
    ipcRenderer.on(
      IPC_CHANNELS.MONITORING_SESSION_UPDATE,
      (_event: IpcRendererEvent, state: MonitoringSessionState | null) => callback(state)
    );
  },

  onMonitoringCaptureProgress: (
    callback: (progress: {
      sessionId: string;
      captureCount: number;
      latestCapture: unknown;
    }) => void
  ) => {
    ipcRenderer.on(
      IPC_CHANNELS.MONITORING_CAPTURE_PROGRESS,
      (
        _event: IpcRendererEvent,
        progress: { sessionId: string; captureCount: number; latestCapture: unknown }
      ) => callback(progress)
    );
  },
});

console.log("[Preload] Console preload script finished - window.consoleAPI exposed");
