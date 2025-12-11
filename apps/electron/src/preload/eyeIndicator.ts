import { contextBridge, ipcRenderer } from 'electron';

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  EYE_INDICATOR_MOVE: 'eye-indicator:move',
} as const;

contextBridge.exposeInMainWorld('eyeIndicatorAPI', {
  moveWindow: (deltaX: number, deltaY: number) => {
    ipcRenderer.send(IPC_CHANNELS.EYE_INDICATOR_MOVE, deltaX, deltaY);
  },
});

