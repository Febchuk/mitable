import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

console.log("[Preload] Console preload script starting...");

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  HELP_REQUEST: "help-request",
  HELP_RESPONSE: "help-response",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  GUIDE_START: "guide-start",
  GUIDE_DATA: "guide-data",
  CONVERSATION_NEW: "conversation-new",
  CONVERSATION_LOAD: "conversation-load",
  AGENT_OPEN_CONVERSATION: "agent-open-conversation", // NEW: Send conversation to Agent
  CONSOLE_MINIMIZE: "console-minimize", // NEW: Minimize console window
  NUDGE_OPEN_CREATOR: "nudge-open-creator",
  OVERLAY_SHOW: "overlay-show", // NEW: Show overlay with bounding box
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

  // Screenshot capture
  captureScreenshot: async (): Promise<{
    dataUrl: string;
    metadata: {
      width: number;
      height: number;
      originalWidth: number;
      originalHeight: number;
      scaleFactor: number;
      captureMode: string;
      timestamp: number;
    };
  } | null> => {
    console.log("[Preload] captureScreenshot() called from renderer");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT);

    // IPC handler returns { dataUrl, metadata } - return the full object
    if (result && typeof result === "object" && "dataUrl" in result) {
      console.log("[Preload] Screenshot captured successfully:", {
        dataUrlLength: result.dataUrl?.length || 0,
        hasMetadata: !!result.metadata,
        dimensions: result.metadata ? `${result.metadata.width}x${result.metadata.height}` : "N/A",
      });
      return result;
    }

    console.error("[Preload] Screenshot capture failed - invalid result:", result);
    return null;
  },

  // Guide system
  startGuide: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data),
  onGuideData: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_DATA, (_event: IpcRendererEvent, data: unknown) =>
      callback(data)
    );
  },

  // Conversation management
  newConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_NEW),
  loadConversation: (id: string) => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LOAD, id),
  sendToAgent: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.AGENT_OPEN_CONVERSATION, conversationId), // NEW: Send conversation to Agent window

  // Window management
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.CONSOLE_MINIMIZE),

  // Overlay management
  showOverlay: (data: unknown) => {
    console.log("[Preload] showOverlay() CALLED with data:", data);
    console.log("[Preload] Sending IPC event:", IPC_CHANNELS.OVERLAY_SHOW);
    ipcRenderer.send(IPC_CHANNELS.OVERLAY_SHOW, data);
    console.log("[Preload] IPC SENT to main process");
  },

  // Navigation - Listen for navigation requests from main process
  onNavigateToChat: (callback: (conversationId: string) => void) => {
    const handler = (_event: IpcRendererEvent, conversationId: string) => callback(conversationId);
    ipcRenderer.on("navigate-to-chat", handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener("navigate-to-chat", handler);
  },

  // Nudge creator
  onNudgeOpenCreator: (callback: (data: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.NUDGE_OPEN_CREATOR, handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NUDGE_OPEN_CREATOR, handler);
  },

  // Auth management - Console sends tokens to main process after login
  setAuthTokens: (accessToken: string, refreshToken: string) =>
    ipcRenderer.send(IPC_CHANNELS.AUTH_SET_TOKENS, accessToken, refreshToken),
  clearAuthTokens: () => ipcRenderer.send(IPC_CHANNELS.AUTH_CLEAR),
  onAuthTokenUpdated: (callback: (token: string | null) => void) => {
    const handler = (_event: IpcRendererEvent, token: string | null) => callback(token);
    ipcRenderer.on(IPC_CHANNELS.AUTH_TOKEN_UPDATED, handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_TOKEN_UPDATED, handler);
  },
});

console.log("[Preload] Console preload script finished - window.consoleAPI exposed");
