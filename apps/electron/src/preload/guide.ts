import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  GUIDE_DATA: "guide-data",
  GUIDE_NEXT_STEP: "guide-next-step",
  GUIDE_STEP_UPDATE: "guide-step-update",
  GUIDE_COMPLETE: "guide-complete",
  GUIDE_CANCEL: "guide-cancel",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  PII_DETECTION_START: "pii:detection:start",
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

// Expose PII redaction API
contextBridge.exposeInMainWorld("piiAPI", {
  redactScreenshot: (screenshot: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PII_DETECTION_START, screenshot),
});

// Expose screenshot capture API (if needed by guide)
contextBridge.exposeInMainWorld("captureAPI", {
  captureScreen: (options?: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT, options),
});
