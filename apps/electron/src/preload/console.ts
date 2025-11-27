import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { MultiWindowCaptureResult } from "@mitable/shared";

console.log("[Preload] Console preload script starting...");

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  HELP_REQUEST: "help-request",
  HELP_RESPONSE: "help-response",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  CONVERSATION_NEW: "conversation-new",
  CONVERSATION_LOAD: "conversation-load",
  AGENT_OPEN_CONVERSATION: "agent-open-conversation", // NEW: Send conversation to Agent
  CONSOLE_MINIMIZE: "console-minimize", // NEW: Minimize console window
  NUDGE_OPEN_CREATOR: "nudge-open-creator",
  AUTH_SET_TOKENS: "auth-set-tokens",
  AUTH_CLEAR: "auth-clear",
  AUTH_TOKEN_UPDATED: "auth-token-updated",
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

  // Conversation management
  newConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_NEW),
  loadConversation: (id: string) => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LOAD, id),
  sendToAgent: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.AGENT_OPEN_CONVERSATION, conversationId), // NEW: Send conversation to Agent window

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
});

console.log("[Preload] Console preload script finished - window.consoleAPI exposed");
