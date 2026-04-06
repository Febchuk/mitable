import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { MonitoringSessionState, SelectedWindowInfo, WatchableWindow } from "@mitable/shared";

// IPC channel constants (inlined to avoid chunking issues - preloads can't resolve npm modules at runtime)
const IPC_CHANNELS = {
  MONITORING_SESSION_START: "monitoring-session-start",
  MONITORING_SESSION_PAUSE: "monitoring-session-pause",
  MONITORING_SESSION_RESUME: "monitoring-session-resume",
  MONITORING_SESSION_STOP_LOCAL_FOR_DELETE: "monitoring-session-stop-local-for-delete",
  MONITORING_SESSION_STATUS: "monitoring-session-status",
  MONITORING_SESSION_UPDATE: "monitoring-session-update",
  MONITORING_CAPTURE_PROGRESS: "monitoring-capture-progress",
  MONITORING_AUDIO_START: "monitoring-audio-start",
  MONITORING_AUDIO_STOP: "monitoring-audio-stop",
  MONITORING_AUDIO_FORCE_STOP: "monitoring-audio-force-stop",
  MONITORING_AUDIO_FORCE_START: "monitoring-audio-force-start",
  WATCH_WINDOWS_GET_ALL: "watch-windows-get-all",
  WATCH_WINDOWS_GET_SELECTED: "watch-windows-get-selected",
  WATCH_WINDOW_SELECT: "watch-window-select",
  WATCH_WINDOWS_TOGGLE: "watch-windows-toggle",
  WATCH_WINDOW_UNSELECT: "watch-window-unselect",
  WATCH_WINDOWS_UPDATED: "watch-windows-updated",
  WATCHING_PILL_HIDE: "watching-pill-hide",
  WATCHING_PILL_SHOW_EYE_DROPDOWN: "watching-pill-show-eye-dropdown",
  WATCHING_PILL_HIDE_EYE_DROPDOWN: "watching-pill-hide-eye-dropdown",
  SHOW_CONSOLE: "show-console",
  USER_CONTEXT_GET: "user-context-get",
  CREATE_BACKEND_SESSION: "create-backend-session",
  PILL_DISPLAY_MODE_GET: "pill-display-mode-get",
  PILL_DISPLAY_MODE_SET: "pill-display-mode-set",
  PILL_DISPLAY_MODE_CHANGED: "pill-display-mode-changed",
  PILL_FOCUS_TRACKER_WINDOW_PICKER_GET: "pill-focus-tracker-window-picker-get",
  PILL_FOCUS_TRACKER_WINDOW_PICKER_CHANGED: "pill-focus-tracker-window-picker-changed",
} as const;

// Session start config type
interface SessionStartConfig {
  sessionId: string;
  selectedWindows: SelectedWindowInfo[];
  captureIntervalMs: number;
  name?: string;
  userId: string;
  organizationId: string;
}

contextBridge.exposeInMainWorld("watchingPillAPI", {
  startSession: (config: SessionStartConfig): Promise<{ sessionId: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_START, config),

  // Same channels as console preload `pauseMonitoringSession` / `resumeMonitoringSession`
  pauseSession: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_PAUSE),

  resumeSession: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_RESUME),

  stopLocalSessionForDelete: (): Promise<{
    success: boolean;
    sessionId?: string;
    captureCount?: number;
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_STOP_LOCAL_FOR_DELETE),

  getSessionState: (): Promise<MonitoringSessionState | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_SESSION_STATUS),

  onSessionUpdate: (callback: (state: MonitoringSessionState | null) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: MonitoringSessionState | null) =>
      callback(state);
    ipcRenderer.on(IPC_CHANNELS.MONITORING_SESSION_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MONITORING_SESSION_UPDATE, handler);
  },

  onCaptureProgress: (callback: (data: { captureCount: number }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: { captureCount: number }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.MONITORING_CAPTURE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MONITORING_CAPTURE_PROGRESS, handler);
  },

  getVisibleWindows: (): Promise<{
    success: boolean;
    windows: WatchableWindow[];
    error?: string;
  }> => ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_GET_ALL),

  getSelectedWindows: (): Promise<SelectedWindowInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED),

  selectWindow: (windowInfo: {
    windowId: string;
    appName: string;
    windowTitle?: string;
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOW_SELECT, windowInfo),

  toggleWatchMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, enabled),

  unselectWindow: (windowId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_WINDOW_UNSELECT, windowId),

  onWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, windows: SelectedWindowInfo[]) => callback(windows);
    ipcRenderer.on(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, handler);
  },

  hide: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE);
  },

  showConsole: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SHOW_CONSOLE);
  },

  showEyeDropdown: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCHING_PILL_SHOW_EYE_DROPDOWN),

  hideEyeDropdown: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WATCHING_PILL_HIDE_EYE_DROPDOWN);
  },

  onEyeDropdownClosed: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on("eye-dropdown-closed", handler);
    return () => ipcRenderer.removeListener("eye-dropdown-closed", handler);
  },

  getShowFocusTrackerWindowPickerOnPill: (): Promise<{ enabled: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PILL_FOCUS_TRACKER_WINDOW_PICKER_GET),

  onShowFocusTrackerWindowPickerOnPillChanged: (callback: (enabled: boolean) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, enabled: boolean) => callback(enabled);
    ipcRenderer.on(IPC_CHANNELS.PILL_FOCUS_TRACKER_WINDOW_PICKER_CHANGED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.PILL_FOCUS_TRACKER_WINDOW_PICKER_CHANGED, handler);
  },

  getCurrentUser: (): Promise<{ userId: string; organizationId: string } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_CONTEXT_GET),

  createBackendSession: (config: {
    selectedWindows: Array<{ windowId: string; appName: string; windowTitle?: string }>;
    captureIntervalMs: number;
    name?: string;
  }): Promise<{ session?: { id: string }; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_BACKEND_SESSION, config),

  startAudioRecording: (): Promise<{ success: boolean; hasSystemAudio: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_AUDIO_START),

  stopAudioRecording: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MONITORING_AUDIO_STOP),

  sendAudioChunk: (audioBuffer: ArrayBuffer): void => {
    ipcRenderer.send("audio-chunk", audioBuffer);
  },

  onForceStopAudio: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP, handler);
  },

  onForceStartAudio: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.MONITORING_AUDIO_FORCE_START, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MONITORING_AUDIO_FORCE_START, handler);
  },

  getPillDisplayMode: (userId: string): Promise<"compact" | "expanded"> =>
    ipcRenderer.invoke(IPC_CHANNELS.PILL_DISPLAY_MODE_GET, userId),

  onPillDisplayModeChanged: (callback: (mode: "compact" | "expanded") => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, mode: "compact" | "expanded") => callback(mode);
    ipcRenderer.on(IPC_CHANNELS.PILL_DISPLAY_MODE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PILL_DISPLAY_MODE_CHANGED, handler);
  },
});

declare global {
  interface Window {
    watchingPillAPI: {
      startSession: (config: SessionStartConfig) => Promise<{ sessionId: string; error?: string }>;
      pauseSession: () => Promise<{ success: boolean; error?: string }>;
      resumeSession: () => Promise<{ success: boolean; error?: string }>;
      stopLocalSessionForDelete: () => Promise<{
        success: boolean;
        sessionId?: string;
        captureCount?: number;
        error?: string;
      }>;
      getSessionState: () => Promise<MonitoringSessionState | null>;
      onSessionUpdate: (callback: (state: MonitoringSessionState | null) => void) => () => void;
      onCaptureProgress: (callback: (data: { captureCount: number }) => void) => () => void;
      getVisibleWindows: () => Promise<{
        success: boolean;
        windows: WatchableWindow[];
        error?: string;
      }>;
      getSelectedWindows: () => Promise<SelectedWindowInfo[]>;
      selectWindow: (windowInfo: {
        windowId: string;
        appName: string;
        windowTitle?: string;
      }) => Promise<{ success: boolean; error?: string }>;
      toggleWatchMode: (enabled: boolean) => Promise<void>;
      unselectWindow: (windowId: string) => Promise<void>;
      onWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void) => () => void;
      hide: () => void;
      showConsole: () => void;
      showEyeDropdown: () => Promise<void>;
      hideEyeDropdown: () => void;
      onEyeDropdownClosed: (callback: () => void) => () => void;
      getShowFocusTrackerWindowPickerOnPill: () => Promise<{ enabled: boolean }>;
      onShowFocusTrackerWindowPickerOnPillChanged: (callback: (enabled: boolean) => void) => () => void;
      getCurrentUser: () => Promise<{ userId: string; organizationId: string } | null>;
      createBackendSession: (config: {
        selectedWindows: Array<{ windowId: string; appName: string; windowTitle?: string }>;
        captureIntervalMs: number;
        name?: string;
      }) => Promise<{ session?: { id: string }; error?: string }>;
      startAudioRecording: () => Promise<{
        success: boolean;
        hasSystemAudio: boolean;
        error?: string;
      }>;
      stopAudioRecording: () => Promise<{ success: boolean }>;
      sendAudioChunk: (audioBuffer: ArrayBuffer) => void;
      onForceStopAudio: (callback: () => void) => () => void;
      onForceStartAudio: (callback: () => void) => () => void;
      getPillDisplayMode: (userId: string) => Promise<"compact" | "expanded">;
      onPillDisplayModeChanged: (callback: (mode: "compact" | "expanded") => void) => () => void;
    }
  }
}
