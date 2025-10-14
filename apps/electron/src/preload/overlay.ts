import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";

contextBridge.exposeInMainWorld("overlayAPI", {
  onHighlightUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, (_event: IpcRendererEvent, data: unknown) => callback(data));
  },
  show: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_SHOW),
  hide: () => ipcRenderer.send(IPC_CHANNELS.OVERLAY_HIDE),
});
