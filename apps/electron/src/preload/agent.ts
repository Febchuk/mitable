const { contextBridge, ipcRenderer } = require("electron");

// IPC channel constants (inlined to avoid requiring external packages with sandboxing)
const IPC_CHANNELS = {
  AGENT_TOGGLE: "agent-toggle",
  AGENT_SHOW_CONSOLE: "agent-show-console",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
} as const;

contextBridge.exposeInMainWorld("agentAPI", {
  toggle: () => ipcRenderer.send(IPC_CHANNELS.AGENT_TOGGLE),
  showConsole: () => ipcRenderer.send(IPC_CHANNELS.AGENT_SHOW_CONSOLE),
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, ignore),
});
