import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid import issues with preload context)
const IPC_CHANNELS = {
  WATCHING_PILL_PAUSE: "watching-pill-pause",
  WATCHING_PILL_RESUME: "watching-pill-resume",
  WATCHING_PILL_SEND_UPDATE: "watching-pill-send-update",
  WATCHING_PILL_HIDE: "watching-pill-hide",
} as const;

export interface WatchingState {
  isPaused: boolean;
}

contextBridge.exposeInMainWorld("watchingPillAPI", {
  // Actions - send commands to main process
  pause: () => {
    console.log("[WatchingPill Preload] Pause watching");
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_PAUSE);
  },

  resume: () => {
    console.log("[WatchingPill Preload] Resume watching");
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_RESUME);
  },

  sendUpdate: () => {
    console.log("[WatchingPill Preload] Send update triggered");
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_SEND_UPDATE);
  },

  hide: () => {
    console.log("[WatchingPill Preload] Hide pill");
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE);
  },
});

// Type declarations for renderer
declare global {
  interface Window {
    watchingPillAPI: {
      pause: () => void;
      resume: () => void;
      sendUpdate: () => void;
      hide: () => void;
    };
  }
}
