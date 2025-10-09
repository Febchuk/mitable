const { contextBridge, ipcRenderer } = require("electron");

// IPC channel constants (inlined to avoid requiring external packages with sandboxing)
const IPC_CHANNELS = {
  OVERLAY_HIGHLIGHT_UPDATE: "overlay-highlight-update",
  OVERLAY_SHOW: "overlay-show",
  OVERLAY_HIDE: "overlay-hide",
} as const;

contextBridge.exposeInMainWorld("overlayAPI", {
  onHighlightUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, (_event, data) => callback(data));
  },
  show: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_SHOW),
  hide: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_HIDE),
});
