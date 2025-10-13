const { contextBridge, ipcRenderer } = require("electron");

// IPC channel constants (inlined to avoid requiring external packages with sandboxing)
const IPC_CHANNELS = {
  AGENT_TOGGLE: "agent-toggle",
  AGENT_SHOW_CONSOLE: "agent-show-console",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
  AGENT_RESIZE: "agent-resize",
  NUDGE_SHOW: "nudge-show",
  GUIDE_START: "guide-start",
} as const;

contextBridge.exposeInMainWorld("agentAPI", {
  toggle: () => ipcRenderer.send(IPC_CHANNELS.AGENT_TOGGLE),
  showConsole: () => ipcRenderer.send(IPC_CHANNELS.AGENT_SHOW_CONSOLE),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
  resizeWindow: (mode: 'pill' | 'conversation') =>
    ipcRenderer.send(IPC_CHANNELS.AGENT_RESIZE, mode),
  showNudge: (data: unknown) =>
    ipcRenderer.send(IPC_CHANNELS.NUDGE_SHOW, data),
  startGuide: (data: unknown) =>
    ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data),
});
