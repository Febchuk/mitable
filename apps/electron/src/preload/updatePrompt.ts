import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid import issues with preload context)
const IPC_CHANNELS = {
  UPDATE_PROMPT_EDIT: "update-prompt-edit",
  UPDATE_PROMPT_SEND: "update-prompt-send",
  UPDATE_PROMPT_DISMISS: "update-prompt-dismiss",
  UPDATE_PROMPT_TRIGGER: "update-prompt-trigger",
} as const;

export interface DraftInfo {
  id: string;
  topic: string;
  recipient: string;
}

contextBridge.exposeInMainWorld("updatePromptAPI", {
  // Actions - send commands to main process
  editDraft: (draftId: string) => {
    console.log("[UpdatePrompt Preload] Edit draft:", draftId);
    ipcRenderer.send(IPC_CHANNELS.UPDATE_PROMPT_EDIT, draftId);
  },

  sendNow: (draftId: string) => {
    console.log("[UpdatePrompt Preload] Send now:", draftId);
    ipcRenderer.send(IPC_CHANNELS.UPDATE_PROMPT_SEND, draftId);
  },

  dismiss: () => {
    console.log("[UpdatePrompt Preload] Dismiss");
    ipcRenderer.send(IPC_CHANNELS.UPDATE_PROMPT_DISMISS);
  },

  // Event listeners - receive data from main process
  onTrigger: (callback: (draft: DraftInfo) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_PROMPT_TRIGGER, (_event, draft: DraftInfo) => {
      console.log("[UpdatePrompt Preload] Received trigger:", draft);
      callback(draft);
    });
  },
});

// Type declarations for renderer
declare global {
  interface Window {
    updatePromptAPI: {
      editDraft: (draftId: string) => void;
      sendNow: (draftId: string) => void;
      dismiss: () => void;
      onTrigger: (callback: (draft: DraftInfo) => void) => void;
    };
  }
}
