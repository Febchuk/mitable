import { contextBridge, ipcRenderer } from 'electron';

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
    OBSERVATION_START: 'observation:start',
    OBSERVATION_END: 'observation:end',
    OBSERVATION_CANCEL: 'observation:cancel',
} as const;

contextBridge.exposeInMainWorld('observationAPI', {
    startSession: () => {
        ipcRenderer.send(IPC_CHANNELS.OBSERVATION_START);
    },
    endSession: () => {
        ipcRenderer.send(IPC_CHANNELS.OBSERVATION_END);
    },
    cancel: () => {
        ipcRenderer.send(IPC_CHANNELS.OBSERVATION_CANCEL);
    },
});

