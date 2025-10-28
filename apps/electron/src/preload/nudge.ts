import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  NUDGE_SHOW: "nudge-show",
  NUDGE_ACCEPT: "nudge-accept",
  NUDGE_DISMISS: "nudge-dismiss",
  NUDGE_CREATE_REQUEST: "nudge-create-request",
  NUDGE_GENERATE_CONTEXT: "nudge-generate-context", // NEW: For AI context generation
  NUDGE_GENERATE_QUESTION: "nudge-generate-question", // NEW: For AI question generation
  NUDGE_RESIZE: "nudge-resize", // NEW: Dynamic window resizing
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
} as const;

contextBridge.exposeInMainWorld("nudgeAPI", {
  onNudgeShow: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.NUDGE_SHOW, (_event: IpcRendererEvent, data: unknown) =>
      callback(data)
    );
  },
  accept: (nudgeId: string) => ipcRenderer.send(IPC_CHANNELS.NUDGE_ACCEPT, nudgeId),
  dismiss: (nudgeId: string) => ipcRenderer.send(IPC_CHANNELS.NUDGE_DISMISS, nudgeId),
  createNudge: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.NUDGE_CREATE_REQUEST, data),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),

  // NEW: Dynamic window resizing
  resizeWindow: (options: { width?: number; height?: number } | "collapsed" | "expanded") =>
    ipcRenderer.send(IPC_CHANNELS.NUDGE_RESIZE, options),

  // NEW: AI generation methods (async - return promises)
  generateContext: (conversationId: string): Promise<{ context: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.NUDGE_GENERATE_CONTEXT, conversationId),
  generateQuestion: (conversationId: string): Promise<{ question: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.NUDGE_GENERATE_QUESTION, conversationId),
});
