import { contextBridge, ipcRenderer } from "electron";
import type { SelectedWindowInfo, MultiWindowCaptureResult } from "@mitable/shared";

// IPC channel constants for Agent Panel
const IPC_CHANNELS = {
  // Panel control
  AGENTPANEL_TOGGLE: "agentpanel-toggle",
  AGENTPANEL_SHOW: "agentpanel-show",
  AGENTPANEL_HIDE: "agentpanel-hide",
  AGENTPANEL_SHOWN: "agentpanel-shown", // Fired after panel is shown (for animation)
  AGENTPANEL_RESIZE: "agentpanel-resize",
  AGENTPANEL_VIBRANCY_ON: "agentpanel-vibrancy-on", // Fade in vibrancy after animation
  AGENTPANEL_VIBRANCY_OFF: "agentpanel-vibrancy-off", // Fade out vibrancy before animation

  // Screenshot capture
  CAPTURE_SCREENSHOT: "capture-screenshot",

  // Watch mode
  WATCH_WINDOWS_TOGGLE: "watch-windows-toggle",
  WATCH_WINDOW_UNSELECT: "watch-window-unselect",
  WATCH_WINDOWS_GET_SELECTED: "watch-windows-get-selected",
  WATCH_WINDOWS_UPDATED: "watch-windows-updated",

  // Auth
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_TOKEN_UPDATED: "auth-token-updated",

  // Console integration
  CONSOLE_OPEN_CHAT: "console-open-chat",
  CONSOLE_OPEN_CHATS: "console-open-chats",
  AGENTPANEL_LOAD_CONVERSATION: "agentpanel-load-conversation",
} as const;

contextBridge.exposeInMainWorld("agentPanelAPI", {
  // Panel control
  toggle: () => ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_TOGGLE),
  show: () => ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_SHOW),
  hide: () => ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_HIDE),
  resize: (width: number) => ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_RESIZE, width),

  // Vibrancy control for animation coordination
  vibrancyOn: () => ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_VIBRANCY_ON),
  vibrancyOff: () => ipcRenderer.send(IPC_CHANNELS.AGENTPANEL_VIBRANCY_OFF),

  // Screenshot capture - returns multi-window capture result
  captureScreenshot: (): Promise<MultiWindowCaptureResult> => {
    console.log("[AgentPanel Preload] captureScreenshot() called");
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT);
  },

  // Watch mode for selective screenshot capture
  toggleWatchMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, enabled),
  unselectWindow: (windowId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOW_UNSELECT, windowId),
  getSelectedWindows: (): Promise<SelectedWindowInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED),

  // Watch mode event listeners
  onWatchWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void) => {
    const listener = (_event: unknown, windows: SelectedWindowInfo[]) => callback(windows);
    ipcRenderer.on(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, listener);
  },
  offWatchWindowsUpdated: (_callback: (windows: SelectedWindowInfo[]) => void) => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.WATCH_WINDOWS_UPDATED);
  },

  // Auth management
  getAuthToken: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_TOKEN),
  onAuthTokenUpdated: (callback: (token: string | null) => void) => {
    ipcRenderer.on(IPC_CHANNELS.AUTH_TOKEN_UPDATED, (_event, token: string | null) =>
      callback(token)
    );
  },

  // Console integration
  openInConsole: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.CONSOLE_OPEN_CHAT, conversationId),
  openChats: () => ipcRenderer.send(IPC_CHANNELS.CONSOLE_OPEN_CHATS),

  // Panel show event (for entrance animation)
  onPanelShow: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.AGENTPANEL_SHOWN, () => callback());
  },

  // Listen for conversation load requests from Console
  onLoadConversation: (callback: (conversationId: string) => void) => {
    const listener = (_event: unknown, conversationId: string) => callback(conversationId);
    ipcRenderer.on(IPC_CHANNELS.AGENTPANEL_LOAD_CONVERSATION, listener);
  },
  offLoadConversation: (_callback: (conversationId: string) => void) => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.AGENTPANEL_LOAD_CONVERSATION);
  },
});
