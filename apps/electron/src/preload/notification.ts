import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  NOTIFICATION_DATA: "notification-data",
  NOTIFICATION_ACTION: "notification-action",
  NOTIFICATION_HIDE: "notification-hide",
} as const;

// Notification action button
export interface NotificationAction {
  id: string;
  label: string;
  primary?: boolean;
}

// Notification configuration
export interface NotificationConfig {
  title: string;
  message: string;
  icon?: string;
  actions: NotificationAction[];
  timeout?: number; // Auto-dismiss timeout in ms
}

contextBridge.exposeInMainWorld("notificationAPI", {
  // Receive notification data from main process
  onData: (callback: (data: NotificationConfig) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: NotificationConfig) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_DATA, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_DATA, handler);
  },

  // Send action click to main process
  handleAction: (actionId: string): void => {
    ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_ACTION, actionId);
  },

  // Close/dismiss this notification
  close: (): void => {
    ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_HIDE);
  },
});

// Type declarations for renderer
declare global {
  interface Window {
    notificationAPI: {
      onData: (callback: (data: NotificationConfig) => void) => () => void;
      handleAction: (actionId: string) => void;
      close: () => void;
    };
  }
}
