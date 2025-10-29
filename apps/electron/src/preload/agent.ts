import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  AGENT_TOGGLE: "agent-toggle",
  AGENT_SHOW_CONSOLE: "agent-show-console",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
  AGENT_RESIZE: "agent-resize",
  AGENT_GUIDE_NEXT_STEP: "agent-guide-next-step",
  AGENT_HIDE_TEMP: "agent-hide-temp",
  AGENT_RESTORE: "agent-restore",
  CONVERSATION_SHOW: "conversation-show",
  CONVERSATION_HIDE: "conversation-hide",
  CONVERSATION_TOGGLE: "conversation-toggle", // NEW: Toggle collapsed/hidden state
  CONVERSATION_SEND_MESSAGE: "conversation-send-message",
  CONSOLE_OPEN_CHAT: "console-open-chat",
  NUDGE_SHOW: "nudge-show",
  GUIDE_START: "guide-start",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  STATUS_SHOW: "status-show",
  STATUS_HIDE: "status-hide",
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_TOKEN_UPDATED: "auth-token-updated",
} as const;

contextBridge.exposeInMainWorld("agentAPI", {
  toggle: () => ipcRenderer.send(IPC_CHANNELS.AGENT_TOGGLE),
  showConsole: () => ipcRenderer.send(IPC_CHANNELS.AGENT_SHOW_CONSOLE),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
  resizeWindow: (
    options:
      | { width?: number; height?: number }
      | "pill"
      | "conversation"
      | "text-mode"
      | "audio-mode"
  ) => ipcRenderer.send(IPC_CHANNELS.AGENT_RESIZE, options),

  // Conversation window management
  showConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SHOW),
  hideConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_HIDE),
  toggleConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_TOGGLE), // NEW: Toggle collapsed state
  sendMessageToConversation: (messageData: any, screenshot: string | null) =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, messageData, screenshot),
  openConversationInConsole: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.CONSOLE_OPEN_CHAT, conversationId),

  showNudge: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.NUDGE_SHOW, data),
  startGuide: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data),

  // Screenshot capture - for workflow visual guidance
  // Returns {dataUrl: string, metadata: ScreenshotMetadata} or null on failure
  captureScreenshot: (): Promise<{
    dataUrl: string;
    metadata: {
      width: number;
      height: number;
      originalWidth: number;
      originalHeight: number;
      captureMode: string;
      timestamp: number;
      window?: unknown;
    };
  } | null> => {
    console.log("[Agent Preload] captureScreenshot() called from renderer");
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT);
  },

  // Screenshot animation helpers - hide/restore agent window
  hideTemporary: () => ipcRenderer.send(IPC_CHANNELS.AGENT_HIDE_TEMP),
  restore: () => ipcRenderer.send(IPC_CHANNELS.AGENT_RESTORE),

  // Status window control - "Looking at your screen" indicator
  showStatus: () => ipcRenderer.send(IPC_CHANNELS.STATUS_SHOW),
  hideStatus: () => ipcRenderer.send(IPC_CHANNELS.STATUS_HIDE),

  // Auth management - Agent requests token from main process
  getAuthToken: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_TOKEN),
  onAuthTokenUpdated: (callback: (token: string | null) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUTH_TOKEN_UPDATED, (_event, token: string | null) =>
      callback(token)
    );
  },

  // Guide next step - triggered when Guide "Done" button clicked
  onGuideNextStep: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.AGENT_GUIDE_NEXT_STEP, () => callback());
  },
});
