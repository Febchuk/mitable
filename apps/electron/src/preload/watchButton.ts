import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid import issues with preload context)
const IPC_CHANNELS = {
  WATCH_WINDOW_SELECT: "watch-window-select",
} as const;

contextBridge.exposeInMainWorld("watchButtonAPI", {
  selectWindow: (windowInfo: { windowId: string; appName: string; windowTitle: string }) => {
    console.log("[WatchButton Preload] Selecting window:", windowInfo);
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOW_SELECT, windowInfo);
  },
});
