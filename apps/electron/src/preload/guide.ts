import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  GUIDE_DATA: "guide-data",
  GUIDE_NEXT_STEP: "guide-next-step",
  GUIDE_STEP_UPDATE: "guide-step-update",
  GUIDE_COMPLETE: "guide-complete",
  GUIDE_CANCEL: "guide-cancel",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
} as const;

contextBridge.exposeInMainWorld("guideAPI", {
  onGuideData: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_DATA, (_event: IpcRendererEvent, data: unknown) =>
      callback(data)
    );
  },
  nextStep: (data: { conversationId: string; currentStepIndex: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.GUIDE_NEXT_STEP, data),
  onStepUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_STEP_UPDATE, (_event: IpcRendererEvent, data: unknown) =>
      callback(data)
    );
  },
  updateStep: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_STEP_UPDATE, data),
  complete: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_COMPLETE),
  cancel: () => ipcRenderer.send(IPC_CHANNELS.GUIDE_CANCEL),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
});
