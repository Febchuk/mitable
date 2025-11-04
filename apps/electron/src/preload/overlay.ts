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
    const handler = (_event: IpcRendererEvent, data: unknown) => {
      callback(data);
    };

    ipcRenderer.on(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, handler);

    // Return cleanup function to remove this specific listener
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, handler);
    };
  },
  show: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_SHOW),
  hide: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_HIDE),
  getDisplayMetadata: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DISPLAY_METADATA),
});
