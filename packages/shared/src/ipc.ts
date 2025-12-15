// IPC Channel definitions for Electron window communication

export const IPC_CHANNELS = {
  // Help system
  HELP_REQUEST: "help-request",
  HELP_RESPONSE: "help-response",
  CAPTURE_SCREENSHOT: "capture-screenshot",
  SCREENSHOT_CAPTURED: "screenshot-captured",
  CAPTURE_FEEDBACK: "capture-feedback", // Visual/audio feedback on capture success/failure
  CAPTURE_CANCEL: "capture-cancel", // Cancel ongoing capture operation

  // Guide system
  GUIDE_START: "guide-start",
  GUIDE_NEXT_STEP: "guide-next-step",
  GUIDE_STEP_UPDATE: "guide-step-update",
  GUIDE_COMPLETE: "guide-complete",
  GUIDE_CANCEL: "guide-cancel",
  GUIDE_DATA: "guide-data",

  // Overlay system
  OVERLAY_SHOW: "overlay-show",
  OVERLAY_HIDE: "overlay-hide",
  OVERLAY_HIGHLIGHT_UPDATE: "overlay-highlight-update",
  GET_DISPLAY_METADATA: "get-display-metadata",

  // Watch mode for selective screenshot capture
  WATCH_WINDOWS_TOGGLE: "watch-windows-toggle",
  WATCH_WINDOWS_GET_ALL: "watch-windows-get-all",
  WATCH_WINDOW_SELECT: "watch-window-select",
  WATCH_WINDOW_UNSELECT: "watch-window-unselect",
  WATCH_WINDOWS_GET_SELECTED: "watch-windows-get-selected",
  WATCH_BUTTON_WINDOW_CREATE: "watch-button-window-create",
  WATCH_BUTTON_WINDOW_CLOSE: "watch-button-window-close",
  WATCH_WINDOWS_UPDATED: "watch-windows-updated", // Broadcast event when selected windows change

  // Nudge system
  NUDGE_SHOW: "nudge-show",
  NUDGE_HIDE: "nudge-hide",
  NUDGE_ACCEPT: "nudge-accept",
  NUDGE_DISMISS: "nudge-dismiss",
  NUDGE_CREATE_REQUEST: "nudge-create-request",
  NUDGE_OPEN_CREATOR: "nudge-open-creator",
  OPEN_CONSOLE_NUDGE_FORM: "open-console-nudge-form", // Direct Agent → Console nudge creation
  NUDGE_RESIZE: "nudge-resize", // Dynamic window resizing (collapsed/expanded)

  // Window management
  WINDOW_SHOW: "window-show",
  WINDOW_HIDE: "window-hide",
  WINDOW_TOGGLE: "window-toggle",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",
  CONSOLE_MINIMIZE: "console-minimize", // Console → Main (minimize console window)

  // Agent window
  AGENT_TOGGLE: "agent-toggle",
  AGENT_SHOW_CONSOLE: "agent-show-console",
  AGENT_RESIZE: "agent-resize",
  AGENT_GUIDE_NEXT_STEP: "agent-guide-next-step", // Triggered when Guide "Done" button clicked
  AGENT_OPEN_CONVERSATION: "agent-open-conversation", // Console → Main (open specific conversation in agent)
  CONSOLE_OPEN_CHAT: "console-open-chat", // Agent/Conversation → Main (open conversation in console)
  CONSOLE_OPEN_CHATS: "console-open-chats", // AgentPanel → Main (open chats tab in console)

  // Agent Panel window (right-docked chat panel)
  AGENTPANEL_TOGGLE: "agentpanel-toggle", // Toggle visibility
  AGENTPANEL_SHOW: "agentpanel-show", // Show panel
  AGENTPANEL_HIDE: "agentpanel-hide", // Hide panel
  AGENTPANEL_SHOWN: "agentpanel-shown", // Notify renderer after panel shown (for entrance animation)
  AGENTPANEL_RESIZE: "agentpanel-resize", // Resize panel width
  AGENTPANEL_VIBRANCY_ON: "agentpanel-vibrancy-on", // Renderer → Main: fade in vibrancy after animation
  AGENTPANEL_VIBRANCY_OFF: "agentpanel-vibrancy-off", // Renderer → Main: fade out vibrancy before animation
  AGENTPANEL_REQUEST_CLOSE: "agentpanel-request-close", // Main → Renderer: request animated close (from hotkey)
  AGENTPANEL_LOAD_CONVERSATION: "agentpanel-load-conversation", // Console → AgentPanel (load conversation)

  // Conversation window (parent-child with agent)
  CONVERSATION_SHOW: "conversation-show", // Agent → Main (show conversation window)
  CONVERSATION_HIDE: "conversation-hide", // Agent/Conversation → Main (hide conversation window)
  CONVERSATION_SEND_MESSAGE: "conversation-send-message", // Agent → Conversation (forward user message)
  CONVERSATION_UPDATE_MESSAGES: "conversation-update-messages", // Conversation → Agent (sync message state)
  CONVERSATION_POSITION_UPDATE: "conversation-position-update", // Main → Conversation (on pill drag)

  // NEW: Conversation state management (collapsed combobox refactor)
  CONVERSATION_TOGGLE: "conversation-toggle", // Agent → Main (toggle collapsed/hidden)
  CONVERSATION_SET_STATE: "conversation-set-state", // Renderer → Main (set hidden/collapsed/expanded)
  CONVERSATION_SWITCH: "conversation-switch", // Conversation → Main (switch to different conversation)
  CONVERSATION_LIST_REQUEST: "conversation-list-request", // Renderer → Main (request conversation list)
  CONVERSATION_LIST_RESPONSE: "conversation-list-response", // Main → Renderer (return conversation list)
  CONVERSATION_GENERATE_TITLE: "conversation-generate-title", // Backend integration for AI titles

  // Legacy conversation management (kept for backward compatibility)
  CONVERSATION_NEW: "conversation-new",
  CONVERSATION_LOAD: "conversation-load",
  CONVERSATION_UPDATE: "conversation-update",

  // Auth management (cross-window token sharing)
  AUTH_SET_TOKENS: "auth-set-tokens",
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_CLEAR: "auth-clear",
  AUTH_TOKEN_UPDATED: "auth-token-updated",

  // User context (cross-window user info sharing)
  USER_CONTEXT_SET: "user-context-set",
  USER_CONTEXT_GET: "user-context-get",

  // Backend session creation (for windows without direct API access)
  CREATE_BACKEND_SESSION: "create-backend-session",

  // Console window
  SHOW_CONSOLE: "show-console",

  // Update Prompt system (proactive status update suggestions)
  UPDATE_PROMPT_SHOW: "update-prompt-show",
  UPDATE_PROMPT_HIDE: "update-prompt-hide",
  UPDATE_PROMPT_EDIT: "update-prompt-edit",
  UPDATE_PROMPT_SEND: "update-prompt-send",
  UPDATE_PROMPT_DISMISS: "update-prompt-dismiss",
  UPDATE_PROMPT_TRIGGER: "update-prompt-trigger",

  // Watching Pill system (Update Buddy)
  WATCHING_PILL_TOGGLE: "watching-pill-toggle",
  WATCHING_PILL_SHOW: "watching-pill-show",
  WATCHING_PILL_HIDE: "watching-pill-hide",
  WATCHING_PILL_PAUSE: "watching-pill-pause",
  WATCHING_PILL_RESUME: "watching-pill-resume",
  WATCHING_PILL_SEND_UPDATE: "watching-pill-send-update",

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

  // Drafts system (Console)
  DRAFTS_NAVIGATE: "drafts-navigate",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
