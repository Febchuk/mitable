import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  STATUS_SHOW: "status-show",
  STATUS_HIDE: "status-hide",
} as const;

contextBridge.exposeInMainWorld("statusAPI", {
  // The status window is passive - it receives show/hide commands from main process
  // No methods needed for now, but we expose the API for future extensibility

  onShow: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.STATUS_SHOW, () => callback());
  },

  onHide: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.STATUS_HIDE, () => callback());
  },
});
