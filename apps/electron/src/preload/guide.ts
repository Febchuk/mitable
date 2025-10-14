import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";

contextBridge.exposeInMainWorld("guideAPI", {
  onGuideData: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_DATA, (_event: IpcRendererEvent, data: unknown) => callback(data));
  },
  nextStep: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_NEXT_STEP),
  updateStep: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_STEP_UPDATE, data),
  complete: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_COMPLETE),
  cancel: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_CANCEL),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
});
