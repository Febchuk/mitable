import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { SelectedWindowInfo, WatchableWindow } from "@mitable/shared";

const IPC_CHANNELS = {
  WATCHING_PILL_DROPDOWN_DATA: "watching-pill-dropdown-data",
  WATCHING_PILL_DROPDOWN_ACTION: "watching-pill-dropdown-action",
  WATCHING_PILL_HIDE_EYE_DROPDOWN: "watching-pill-hide-eye-dropdown",
  WATCH_WINDOWS_UPDATED: "watch-windows-updated",
} as const;

interface EyeDropdownData {
  type: "eye";
  selectedWindows: SelectedWindowInfo[];
  availableWindows: WatchableWindow[];
  isLoading?: boolean;
}

contextBridge.exposeInMainWorld("dropdownAPI", {
  onData: (callback: (data: EyeDropdownData) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: EyeDropdownData) => {
      if (data.type === "eye") callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, handler);
  },

  onWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, windows: SelectedWindowInfo[]) => callback(windows);
    ipcRenderer.on(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, handler);
  },

  action: (actionType: string, payload?: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_ACTION, {
      type: actionType,
      payload,
    }),

  closeEyeDropdown: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE_EYE_DROPDOWN);
  },
});

declare global {
  interface Window {
    dropdownAPI: {
      onData: (callback: (data: EyeDropdownData) => void) => () => void;
      onWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void) => () => void;
      action: (
        actionType: string,
        payload?: unknown
      ) => Promise<{ success: boolean; error?: string }>;
      closeEyeDropdown: () => void;
    };
  }
}
