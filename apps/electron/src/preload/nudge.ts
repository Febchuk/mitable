import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";

contextBridge.exposeInMainWorld("nudgeAPI", {
  onNudgeShow: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.NUDGE_SHOW, (_event, data) => callback(data));
  },
  accept: (nudgeId: string) => ipcRenderer.send(IPC_CHANNELS.NUDGE_ACCEPT, nudgeId),
  dismiss: (nudgeId: string) => ipcRenderer.send(IPC_CHANNELS.NUDGE_DISMISS, nudgeId),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
});
