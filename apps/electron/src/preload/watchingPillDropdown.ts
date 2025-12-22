import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { MonitoringSessionState, SelectedWindowInfo, WatchableWindow } from "@mitable/shared";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  WATCHING_PILL_DROPDOWN_DATA: "watching-pill-dropdown-data",
  WATCHING_PILL_DROPDOWN_ACTION: "watching-pill-dropdown-action",
  WATCHING_PILL_HIDE_EYE_DROPDOWN: "watching-pill-hide-eye-dropdown",
  WATCHING_PILL_HIDE_MENU_DROPDOWN: "watching-pill-hide-menu-dropdown",
} as const;

// Data types for dropdowns
interface EyeDropdownData {
  type: "eye";
  selectedWindows: SelectedWindowInfo[];
  availableWindows: WatchableWindow[];
}

interface MenuDropdownData {
  type: "menu";
  sessionState: MonitoringSessionState | null;
  selectedWindows: SelectedWindowInfo[];
}

type DropdownData = EyeDropdownData | MenuDropdownData;

contextBridge.exposeInMainWorld("dropdownAPI", {
  // Receive data from main process
  onData: (callback: (data: DropdownData) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: DropdownData) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, handler);
  },

  // Send actions to main process
  action: (actionType: string, payload?: unknown): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_ACTION, {
      type: actionType,
      payload,
    }),

  // Close this dropdown
  closeEyeDropdown: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE_EYE_DROPDOWN);
  },

  closeMenuDropdown: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE_MENU_DROPDOWN);
  },
});

// Type declarations for renderer
declare global {
  interface Window {
    dropdownAPI: {
      onData: (callback: (data: DropdownData) => void) => () => void;
      action: (
        actionType: string,
        payload?: unknown
      ) => Promise<{ success: boolean; error?: string }>;
      closeEyeDropdown: () => void;
      closeMenuDropdown: () => void;
    };
  }
}
