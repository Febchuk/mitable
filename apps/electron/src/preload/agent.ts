import { contextBridge, ipcRenderer } from "electron";
import type { SelectedWindowInfo } from "@mitable/shared";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  AGENT_TOGGLE: "agent-toggle",
  AGENT_SHOW_CONSOLE: "agent-show-console",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
  AGENT_RESIZE: "agent-resize",
  AGENT_GUIDE_NEXT_STEP: "agent-guide-next-step",
  CONVERSATION_SHOW: "conversation-show",
  CONVERSATION_HIDE: "conversation-hide",
  CONVERSATION_TOGGLE: "conversation-toggle", // NEW: Toggle collapsed/hidden state
  CONVERSATION_SEND_MESSAGE: "conversation-send-message",
  CONSOLE_OPEN_CHAT: "console-open-chat",
  NUDGE_SHOW: "nudge-show",
  GUIDE_START: "guide-start",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_TOKEN_UPDATED: "auth-token-updated",
  // Watch mode channels
  WATCH_WINDOWS_TOGGLE: "watch-windows-toggle",
  WATCH_WINDOW_UNSELECT: "watch-window-unselect",
  WATCH_WINDOWS_GET_SELECTED: "watch-windows-get-selected",
  WATCH_WINDOWS_UPDATED: "watch-windows-updated",
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

  // Watch mode for selective screenshot capture
  toggleWatchMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, enabled),
  unselectWindow: (windowId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOW_UNSELECT, windowId),
  getSelectedWindows: (): Promise<SelectedWindowInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED),

  // Event listeners for watch apps updates
  onWatchWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void) => {
    const listener = (_event: unknown, windows: SelectedWindowInfo[]) => callback(windows);
    ipcRenderer.on(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, listener);
  },
  offWatchWindowsUpdated: (_callback: (windows: SelectedWindowInfo[]) => void) => {
    // Remove all listeners for this channel
    // We use removeAllListeners since we only have one listener at a time
    ipcRenderer.removeAllListeners(IPC_CHANNELS.WATCH_WINDOWS_UPDATED);
  },
});
