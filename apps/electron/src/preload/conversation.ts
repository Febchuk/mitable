import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  CONVERSATION_HIDE: "conversation-hide",
  CONVERSATION_SEND_MESSAGE: "conversation-send-message",
  CONVERSATION_UPDATE_MESSAGES: "conversation-update-messages",
  CONVERSATION_POSITION_UPDATE: "conversation-position-update",
  NUDGE_SHOW: "nudge-show",
  GUIDE_START: "guide-start",
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_TOKEN_UPDATED: "auth-token-updated",
} as const;

contextBridge.exposeInMainWorld("conversationAPI", {
  // Window management
  hideWindow: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_HIDE),

  // Message communication with Agent window
  // Returns cleanup function to remove listener
  onMessageReceived: (callback: (message: any, screenshot: string | null) => void) => {
    const handler = (_event: any, message: any, screenshot: string | null) => {
      callback(message, screenshot);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, handler);

    // Return cleanup function to remove this specific listener
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, handler);
    };
  },

  // Update message state (send back to Agent if needed)
  updateMessages: (messages: any[]) =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_UPDATE_MESSAGES, messages),

  // Position updates (when pill is dragged)
  // Returns cleanup function to remove listener
  onPositionUpdate: (callback: (x: number, y: number) => void) => {
    const handler = (_event: any, x: number, y: number) => {
      callback(x, y);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_POSITION_UPDATE, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_POSITION_UPDATE, handler);
    };
  },

  // Trigger Nudge/Guide windows from cards
  showNudge: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.NUDGE_SHOW, data),
  startGuide: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data),

  // Auth management - Conversation requests token from main process
  getAuthToken: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_TOKEN),
  // Returns cleanup function to remove listener
  onAuthTokenUpdated: (callback: (token: string | null) => void) => {
    const handler = (_event: any, token: string | null) => {
      callback(token);
    };

    ipcRenderer.on(IPC_CHANNELS.AUTH_TOKEN_UPDATED, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTH_TOKEN_UPDATED, handler);
    };
  },
});
