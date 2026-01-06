import { contextBridge, ipcRenderer } from "electron";

// Simple logger for preload - console.log outputs to DevTools
const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[WatchButtonPreload]${msg}`, ...args),
};

// IPC channel constants (inlined to avoid import issues with preload context)
const IPC_CHANNELS = {
  WATCH_WINDOW_SELECT: "watch-window-select",
} as const;

contextBridge.exposeInMainWorld("watchButtonAPI", {
  selectWindow: (windowInfo: { windowId: string; appName: string; windowTitle: string }) => {
    logger.info("Selecting window:", windowInfo);
    return ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOW_SELECT, windowInfo);
  },
});
