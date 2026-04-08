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
  AUTH_SESSION_RESTORED: "auth-session-restored", // Main → Renderer: push tokens restored from keychain on startup

  // User context (cross-window user info sharing)
  USER_CONTEXT_SET: "user-context-set",
  USER_CONTEXT_GET: "user-context-get",

  // Navigation (cross-window routing)
  NAVIGATE_TO_ACTIVE_SESSION: "navigate-to-active-session",
  NAVIGATE_TO_SESSION_DETAIL: "navigate-to-session-detail",

  // Watching Pill system (Update Buddy)
  WATCHING_PILL_TOGGLE: "watching-pill-toggle",
  WATCHING_PILL_SHOW: "watching-pill-show",
  WATCHING_PILL_HIDE: "watching-pill-hide",
  WATCHING_PILL_PAUSE: "watching-pill-pause",
  WATCHING_PILL_RESUME: "watching-pill-resume",
  WATCHING_PILL_SEND_UPDATE: "watching-pill-send-update",
  /** Optional pill eye dropdown (focus-tracker window list). User toggle in Settings → Dev. */
  WATCHING_PILL_SHOW_EYE_DROPDOWN: "watching-pill-show-eye-dropdown",
  WATCHING_PILL_HIDE_EYE_DROPDOWN: "watching-pill-hide-eye-dropdown",
  WATCHING_PILL_DROPDOWN_DATA: "watching-pill-dropdown-data",
  WATCHING_PILL_DROPDOWN_ACTION: "watching-pill-dropdown-action",

  /** Settings → Dev: show focus-tracker window picker (eye) on the pill */
  PILL_FOCUS_TRACKER_WINDOW_PICKER_GET: "pill-focus-tracker-window-picker-get",
  PILL_FOCUS_TRACKER_WINDOW_PICKER_SET: "pill-focus-tracker-window-picker-set",
  PILL_FOCUS_TRACKER_WINDOW_PICKER_CHANGED: "pill-focus-tracker-window-picker-changed",

  // Monitoring Session system (Work Session Tracking)
  MONITORING_SESSION_START: "monitoring-session-start", // Start new monitoring session
  MONITORING_SESSION_PAUSE: "monitoring-session-pause", // Pause active session
  MONITORING_SESSION_RESUME: "monitoring-session-resume", // Resume paused session
  /** Stop local capture only — no POST /captures or POST /end. Use before deleting a session from the server. */
  MONITORING_SESSION_STOP_LOCAL_FOR_DELETE: "monitoring-session-stop-local-for-delete",
  MONITORING_SESSION_STATUS: "monitoring-session-status", // Get current session status
  MONITORING_SESSION_UPDATE: "monitoring-session-update", // Broadcast session state changes
  /** Main → renderers: POST /end (and optional capture upload) finished; refetch session list/detail from API */
  MONITORING_SESSION_SERVER_SYNCED: "monitoring-session-server-synced",
  MONITORING_SESSION_RESET: "monitoring-session-reset", // Reset/clear session state (after external delete)
  MONITORING_CAPTURE_TAKEN: "monitoring-capture-taken", // Notify when capture is taken
  MONITORING_CAPTURE_PROGRESS: "monitoring-capture-progress", // Capture count update
  MONITORING_AUDIO_START: "monitoring-audio-start", // Start audio recording for session
  MONITORING_AUDIO_STOP: "monitoring-audio-stop", // Stop audio recording for session
  MONITORING_AUDIO_FORCE_STOP: "monitoring-audio-force-stop", // Main → Renderer: force stop AudioWorklet on session end/pause
  MONITORING_AUDIO_FORCE_START: "monitoring-audio-force-start", // Main → Renderer: auto-restart AudioWorklet on session resume

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
  BLOCK_LIST_GET: "block-list-get",
  BLOCK_LIST_SET: "block-list-set",
  BLOCK_LIST_ADD: "block-list-add",
  BLOCK_LIST_REMOVE: "block-list-remove",
  BLOCK_LIST_GET_DETECTED_APPS: "block-list-get-detected-apps",
  BLOCK_LIST_GET_ALL_APPS: "block-list-get-all-apps",
  BLOCK_LIST_REFRESH_INSTALLED_APPS: "block-list-refresh-installed-apps",
  NOTIFICATION_FREQUENCY_GET: "notification-frequency-get",
  NOTIFICATION_FREQUENCY_SET: "notification-frequency-set",
  AUTO_SESSION_START_GET: "auto-session-start-get",
  AUTO_SESSION_START_SET: "auto-session-start-set",
  AUTO_RECAP_GET: "auto-recap-get",
  AUTO_RECAP_SET: "auto-recap-set",
  AGENT_ENABLED_GET: "agent-enabled-get",
  AGENT_ENABLED_SET: "agent-enabled-set",

  // Summary preferences
  SUMMARY_PREFERENCES_GET: "summary-preferences-get",
  SUMMARY_PREFERENCES_SET: "summary-preferences-set",
  SUMMARY_DEFAULTS_GET: "summary-defaults-get",
  SUMMARY_DEFAULTS_SET: "summary-defaults-set",
  ALWAYS_ASK_ON_SESSION_END_GET: "always-ask-on-session-end-get",
  ALWAYS_ASK_ON_SESSION_END_SET: "always-ask-on-session-end-set",

  // Audio preferences
  AUDIO_DEVICES_ENUMERATE: "audio-devices-enumerate", // Get list of available microphones
  AUDIO_PREFERENCES_GET: "audio-preferences-get", // Get audio settings
  AUDIO_PREFERENCES_SET: "audio-preferences-set", // Save audio settings
  AUDIO_TEST_START: "audio-test-start", // Start mic test with level monitoring
  AUDIO_TEST_STOP: "audio-test-stop", // Stop mic test

  // Pill display mode preference
  PILL_DISPLAY_MODE_GET: "pill-display-mode-get",
  PILL_DISPLAY_MODE_SET: "pill-display-mode-set",
  PILL_DISPLAY_MODE_CHANGED: "pill-display-mode-changed",

  // Theme / appearance preference
  THEME_GET: "theme-get",
  THEME_SET: "theme-set",
  THEME_CHANGED: "theme-changed",

  // End session dialog coordination (pill → console)
  SHOW_END_SESSION_DIALOG: "show-end-session-dialog", // Main → Console: trigger dialog
  END_SESSION_FULL: "end-session-full", // Console → Main: end captures + upload + summarize

  // Notifications (native OS via centralized notificationService — custom toast renderer removed)
  NOTIFICATION_SHOW: "notification-show", // Show native OS notification

  // Passive Monitoring (auto-detect activity for session start/end)
  PASSIVE_MONITORING_SET_ENABLED: "passive-monitoring-set-enabled",
  PASSIVE_MONITORING_GET_STATE: "passive-monitoring-get-state",
  PASSIVE_MONITORING_STATE_UPDATE: "passive-monitoring-state-update",

  // PDF Export
  EXPORT_PDF: "export-pdf", // Renderer → Main: generate PDF from HTML and save

  // Recap Notifications
  SHOW_RECAP_NOTIFICATION: "show-recap-notification", // Renderer → Main: trigger recap notification

  // Update Navigation
  NAVIGATE_TO_UPDATE: "navigate-to-update", // Main → Console: navigate to profile/update section

  // Agent system
  AGENT_SEND_MESSAGE: "agent-send-message", // Console → Main: send message to agent
  AGENT_MESSAGE_EVENT: "agent-message-event", // Main → Console: stream agent events
  AGENT_CANCEL: "agent-cancel", // Console → Main: cancel agent query
  AGENT_APPROVE_PLAN: "agent-approve-plan", // Console → Main: approve or deny proposed plan

  // Browser Bridge (Chrome Extension WebSocket)
  BROWSER_BRIDGE_STATUS: "browser-bridge-status", // Console → Main: is extension connected?
  BROWSER_BRIDGE_GET_INFO: "browser-bridge-get-info", // Console → Main: get port/token/connected
  BROWSER_BRIDGE_CONNECTION_UPDATE: "browser-bridge-connection-update", // Main → Console: connection state changed

  // Permissions (macOS onboarding)
  PERMISSIONS_GET_STATUS: "permissions:get-status",
  PERMISSIONS_REQUEST_ACCESSIBILITY: "permissions:request-accessibility",
  PERMISSIONS_OPEN_SCREEN_RECORDING: "permissions:open-screen-recording",

  // Onboarding
  ONBOARDING_GET_VERSION: "onboarding:get-version",
  ONBOARDING_SET_VERSION: "onboarding:set-version",

  // Feedback
  FEEDBACK_GET_LOGS: "feedback:get-logs",
  /** Renderer console lines batched to main for persistence (renderer.log on disk). */
  FEEDBACK_APPEND_RENDERER_LOG: "feedback:append-renderer-log",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
