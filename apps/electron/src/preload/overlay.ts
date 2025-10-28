import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  OVERLAY_HIGHLIGHT_UPDATE: "overlay-highlight-update",
  OVERLAY_SHOW: "overlay-show",
  OVERLAY_HIDE: "overlay-hide",
  GET_DISPLAY_METADATA: "get-display-metadata",
} as const;

contextBridge.exposeInMainWorld("overlayAPI", {
  onHighlightUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on(
      IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE,
      (_event: IpcRendererEvent, data: unknown) => callback(data)
    );
  },
  show: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_SHOW),
  hide: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_HIDE),
  getDisplayMetadata: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DISPLAY_METADATA),
});
