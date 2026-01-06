// IPC Channel definitions for Electron window communication

export const IPC_CHANNELS = {
  // Screenshot capture
  CAPTURE_SCREENSHOT: "capture-screenshot",
  GET_DISPLAY_METADATA: "get-display-metadata",

  // Watch mode for selective screenshot capture
  WATCH_WINDOWS_TOGGLE: "watch-windows-toggle",
  WATCH_WINDOWS_GET_ALL: "watch-windows-get-all",
  WATCH_WINDOW_SELECT: "watch-window-select",
  WATCH_WINDOW_UNSELECT: "watch-window-unselect",
  WATCH_WINDOWS_GET_SELECTED: "watch-windows-get-selected",
  WATCH_WINDOWS_UPDATED: "watch-windows-updated", // Broadcast event when selected windows change

  // Console window
  CONSOLE_MINIMIZE: "console-minimize", // Console → Main (minimize console window)
  SHOW_CONSOLE: "show-console",

  // Auth management (cross-window token sharing)
  AUTH_SET_TOKENS: "auth-set-tokens",
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_CLEAR: "auth-clear",
  AUTH_TOKEN_UPDATED: "auth-token-updated",

  // User context (cross-window user info sharing)
  USER_CONTEXT_SET: "user-context-set",
  USER_CONTEXT_GET: "user-context-get",

  // Navigation (cross-window routing)
  NAVIGATE_TO_ACTIVE_SESSION: "navigate-to-active-session",

  // Watching Pill system (Update Buddy)
  WATCHING_PILL_TOGGLE: "watching-pill-toggle",
  WATCHING_PILL_SHOW: "watching-pill-show",
  WATCHING_PILL_HIDE: "watching-pill-hide",
  WATCHING_PILL_PAUSE: "watching-pill-pause",
  WATCHING_PILL_RESUME: "watching-pill-resume",
  WATCHING_PILL_SEND_UPDATE: "watching-pill-send-update",
  WATCHING_PILL_SHOW_EYE_DROPDOWN: "watching-pill-show-eye-dropdown",
  WATCHING_PILL_HIDE_EYE_DROPDOWN: "watching-pill-hide-eye-dropdown",
  WATCHING_PILL_SHOW_MENU_DROPDOWN: "watching-pill-show-menu-dropdown",
  WATCHING_PILL_HIDE_MENU_DROPDOWN: "watching-pill-hide-menu-dropdown",
  WATCHING_PILL_DROPDOWN_DATA: "watching-pill-dropdown-data", // Send data to dropdown windows
  WATCHING_PILL_DROPDOWN_ACTION: "watching-pill-dropdown-action", // Actions from dropdown to main

  // Monitoring Session system (Work Session Tracking)
  MONITORING_SESSION_START: "monitoring-session-start", // Start new monitoring session
  MONITORING_SESSION_PAUSE: "monitoring-session-pause", // Pause active session
  MONITORING_SESSION_RESUME: "monitoring-session-resume", // Resume paused session
  MONITORING_SESSION_END: "monitoring-session-end", // End session and trigger summary
  MONITORING_SESSION_FINALIZE: "monitoring-session-finalize", // Upload captures + trigger backend summarization
  MONITORING_SESSION_STATUS: "monitoring-session-status", // Get current session status
  MONITORING_SESSION_UPDATE: "monitoring-session-update", // Broadcast session state changes
  MONITORING_SESSION_RESET: "monitoring-session-reset", // Reset/clear session state (after external delete)
  MONITORING_CAPTURE_TAKEN: "monitoring-capture-taken", // Notify when capture is taken
  MONITORING_CAPTURE_PROGRESS: "monitoring-capture-progress", // Capture count update

  // Session Recovery (crash recovery)
  SESSION_GET_RECOVERABLE: "session-get-recoverable", // Get list of recoverable sessions
  SESSION_RECOVER: "session-recover", // Recover a specific session
  SESSION_DISCARD: "session-discard", // Discard a recoverable session
  SESSION_SHOW_RECOVERY_DIALOG: "session-show-recovery-dialog", // Show recovery dialog in console

  // Drafts system (Console)
  DRAFTS_NAVIGATE: "drafts-navigate",

  // Preferences
  PREFERENCES_GET: "preferences-get",
  PREFERENCES_SET: "preferences-set",
  PREFERENCES_GET_ALL: "preferences-get-all",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
