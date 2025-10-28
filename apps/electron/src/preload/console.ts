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

  // Screenshot capture
  captureScreenshot: async (): Promise<string | null> => {
    console.log("[Preload] captureScreenshot() called from renderer");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT);

    // IPC handler returns { dataUrl, metadata } - extract just the dataUrl
    if (result && typeof result === "object" && "dataUrl" in result) {
      console.log("[Preload] Screenshot captured successfully:", {
        dataUrlLength: result.dataUrl?.length || 0,
        hasMetadata: !!result.metadata,
      });
      return result.dataUrl;
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
