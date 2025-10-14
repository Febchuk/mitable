import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";

contextBridge.exposeInMainWorld("consoleAPI", {
  // Help system
  requestHelp: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.HELP_REQUEST, data),
  onHelpResponse: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.HELP_RESPONSE, (_event: IpcRendererEvent, data: unknown) => callback(data));
  },

  // Guide system
  startGuide: (data: unknown) => ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data),
  onGuideData: (callback: (data: unknown) => void) => {
    ipcRenderer.on(IPC_CHANNELS.GUIDE_DATA, (_event: IpcRendererEvent, data: unknown) => callback(data));
  },

  // Conversation management
  newConversation: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_NEW),
  loadConversation: (id: string) => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LOAD, id),
});
