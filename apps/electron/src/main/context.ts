import type { BrowserWindow, Tray } from "electron";

/**
 * Shared mutable runtime state for the Electron main process.
 * Every main/ module imports `ctx` and reads/writes properties directly.
 * This avoids circular dependencies and scattered global `let` declarations.
 */
export const ctx = {
  // Window references
  consoleWindow: null as BrowserWindow | null,
  watchingPillWindow: null as BrowserWindow | null,
  watchingPillEyeDropdown: null as BrowserWindow | null,
  watchingPillMenuDropdown: null as BrowserWindow | null,
  notificationWindow: null as BrowserWindow | null,

  // System tray
  tray: null as Tray | null,
  isExplicitQuit: false,

  // Notification timers
  notificationTimer: null as NodeJS.Timeout | null,
  notificationAutoHideTimer: null as NodeJS.Timeout | null,

  // Dropdown debounce state
  eyeDropdownLastHidden: 0,
  menuDropdownLastHidden: 0,
  eyeDropdownReady: false,
  menuDropdownReady: false,

  // Closed window check interval
  closedWindowCheckInterval: null as NodeJS.Timeout | null,

  // Pill cursor-tracking state
  pillCursorTrackingInterval: null as NodeJS.Timeout | null,
  pillCurrentDisplayId: null as number | null,

  // Watch button windows (module scope for cleanup from multiple handlers)
  watchButtonWindows: new Map<string, BrowserWindow>(),

  // User context (shared across all windows for session start)
  currentUserContext: null as {
    userId: string;
    organizationId: string;
    role?: string;
  } | null,

  // Auth token storage
  authTokens: {
    accessToken: null as string | null,
    refreshToken: null as string | null,
  },

  // Audio state
  lastAudioChunkWarnAt: 0,
  audioCleanupDone: false,
  audioActiveBeforePause: false,

  // Shutdown state
  isEndingSession: false,
  wasPassiveRunning: false,
};

export type MainContext = typeof ctx;
