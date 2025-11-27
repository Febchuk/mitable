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
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
