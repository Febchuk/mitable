import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";

contextBridge.exposeInMainWorld("guideAPI", {
  onGuideData: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_DATA, (_event, data) => callback(data));
  },
  nextStep: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_NEXT_STEP),
  complete: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_COMPLETE),
  cancel: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_CANCEL),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
});
