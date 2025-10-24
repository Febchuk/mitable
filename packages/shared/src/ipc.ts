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

  // Nudge system
  NUDGE_SHOW: "nudge-show",
  NUDGE_HIDE: "nudge-hide",
  NUDGE_ACCEPT: "nudge-accept",
  NUDGE_DISMISS: "nudge-dismiss",
  NUDGE_CREATE_REQUEST: "nudge-create-request",
  NUDGE_OPEN_CREATOR: "nudge-open-creator",
  NUDGE_GENERATE_CONTEXT: "nudge-generate-context", // AI context generation
  NUDGE_GENERATE_QUESTION: "nudge-generate-question", // AI question generation

  // Window management
  WINDOW_SHOW: "window-show",
  WINDOW_HIDE: "window-hide",
  WINDOW_TOGGLE: "window-toggle",
  SET_IGNORE_MOUSE_EVENTS: "set-ignore-mouse-events",

  // Agent window
  AGENT_TOGGLE: "agent-toggle",
  AGENT_SHOW_CONSOLE: "agent-show-console",
  AGENT_RESIZE: "agent-resize",
  AGENT_GUIDE_NEXT_STEP: "agent-guide-next-step", // Triggered when Guide "Done" button clicked

  // Conversation management
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
