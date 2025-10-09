const { contextBridge, ipcRenderer } = require("electron");

// IPC channel constants (inlined to avoid requiring external packages with sandboxing)
const IPC_CHANNELS = {
  HELP_REQUEST: "help-request",
  HELP_RESPONSE: "help-response",
  GUIDE_START: "guide-start",
  GUIDE_DATA: "guide-data",
  CONVERSATION_NEW: "conversation-new",
  CONVERSATION_LOAD: "conversation-load",
} as const;

contextBridge.exposeInMainWorld("consoleAPI", {
  // Help system
  requestHelp: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.HELP_REQUEST, data),
  onHelpResponse: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.HELP_RESPONSE, (_event, data) => callback(data));
  },

  // Guide system
  startGuide: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data),
  onGuideData: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_DATA, (_event, data) => callback(data));
  },

  // Conversation management
  newConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_NEW),
  loadConversation: (id: string) => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LOAD, id),
});
