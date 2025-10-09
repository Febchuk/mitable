const { contextBridge, ipcRenderer } = require("electron");

// IPC channel constants (inlined to avoid requiring external packages with sandboxing)
const IPC_CHANNELS = {
  NUDGE_SHOW: "nudge-show",
  NUDGE_ACCEPT: "nudge-accept",
  NUDGE_DISMISS: "nudge-dismiss",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
} as const;

contextBridge.exposeInMainWorld("nudgeAPI", {
  onNudgeShow: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.NUDGE_SHOW, (_event, data) => callback(data));
  },
  accept: (nudgeId: string) => ipcRenderer.send(IPC_CHANNELS.NUDGE_ACCEPT, nudgeId),
  dismiss: (nudgeId: string) => ipcRenderer.send(IPC_CHANNELS.NUDGE_DISMISS, nudgeId),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
});
