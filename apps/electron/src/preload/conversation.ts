import { contextBridge, ipcRenderer } from "electron";

// IPC channel constants (inlined to avoid chunking issues)
const IPC_CHANNELS = {
  CONVERSATION_HIDE: "conversation-hide",
  CONVERSATION_SEND_MESSAGE: "conversation-send-message",
  CONVERSATION_UPDATE_MESSAGES: "conversation-update-messages",
  CONVERSATION_POSITION_UPDATE: "conversation-position-update",
  // NEW: Conversation state management
  CONVERSATION_SET_STATE: "conversation-set-state",
  CONVERSATION_LOAD: "conversation-load",
  CONVERSATION_SWITCH: "conversation-switch",
  CONVERSATION_LIST_REQUEST: "conversation-list-request",
  CONVERSATION_LIST_RESPONSE: "conversation-list-response",
  CONSOLE_OPEN_CHAT: "console-open-chat",
  NUDGE_SHOW: "nudge-show",
  GUIDE_START: "guide-start",
  OPEN_CONSOLE_NUDGE_FORM: "open-console-nudge-form",
  AUTH_GET_TOKEN: "auth-get-token",
  AUTH_TOKEN_UPDATED: "auth-token-updated",
  CAPTURE_SCREENSHOT: "capture-screenshot",
} as const;

contextBridge.exposeInMainWorld("conversationAPI", {
  // Window management
  hideWindow: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_HIDE),

  // NEW: State management for collapsed/expanded views
  setViewState: (state: "hidden" | "collapsed" | "expanded") =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SET_STATE, state),

  // NEW: Listen for state changes from main process
  onViewStateChange: (callback: (state: "hidden" | "collapsed" | "expanded") => void) => {
    const handler = (_event: any, state: "hidden" | "collapsed" | "expanded") => {
      callback(state);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_SET_STATE, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_SET_STATE, handler);
    };
  },

  // NEW: Conversation loading (from Console "send to agent")
  onConversationLoad: (callback: (conversationId: string) => void) => {
    const handler = (_event: any, conversationId: string) => {
      callback(conversationId);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_LOAD, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_LOAD, handler);
    };
  },

  // NEW: Conversation switching
  switchConversation: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_SWITCH, conversationId),

  // NEW: Request conversation list
  requestConversationList: () => ipcRenderer.send(IPC_CHANNELS.CONVERSATION_LIST_REQUEST),

  // NEW: Listen for conversation list response
  onConversationList: (callback: (conversations: any[]) => void) => {
    const handler = (_event: any, conversations: any[]) => {
      callback(conversations);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, handler);
    };
  },

  // Message communication with Agent window
  // Returns cleanup function to remove listener
  onMessageReceived: (callback: (message: any, screenshot: string | null, screenshotMetadata?: any) => void) => {
    const handler = (_event: any, message: any, screenshot: string | null, screenshotMetadata?: any) => {
      callback(message, screenshot, screenshotMetadata);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, handler);

    // Return cleanup function to remove this specific listener
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, handler);
    };
  },

  // Update message state (send back to Agent if needed)
  updateMessages: (messages: any[]) =>
    ipcRenderer.send(IPC_CHANNELS.CONVERSATION_UPDATE_MESSAGES, messages),

  // Position updates (when pill is dragged)
  // Returns cleanup function to remove listener
  onPositionUpdate: (callback: (x: number, y: number) => void) => {
    const handler = (_event: any, x: number, y: number) => {
      callback(x, y);
    };

    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_POSITION_UPDATE, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_POSITION_UPDATE, handler);
    };
  },

  // Trigger Nudge/Guide windows from cards
  showNudge: (data: unknown) => {
    console.log("[Preload] showNudge called with data:", data);
    ipcRenderer.send(IPC_CHANNELS.NUDGE_SHOW, data);
  },
  startGuide: (data: unknown) => {
    console.log("[Preload] startGuide called with data:", {
      hasData: !!data,
      // @ts-ignore
      hasVisualGuidance: !!data?.visualGuidance,
      // @ts-ignore
      hasBoundingBox: !!data?.visualGuidance?.targetElement?.boundingBox,
      data,
    });
    console.log("[Preload] Sending IPC to channel:", IPC_CHANNELS.GUIDE_START);
    ipcRenderer.send(IPC_CHANNELS.GUIDE_START, data);
  },

  // Open conversation in console
  openConversationInConsole: (conversationId: string) =>
    ipcRenderer.send(IPC_CHANNELS.CONSOLE_OPEN_CHAT, conversationId),

  // Open nudge creation form in console with pre-filled data
  openNudgeForm: (data: {
    expert: {
      id: string;
      name: string;
      email: string;
      role: string;
      department: string;
      expertise: string[];
    };
    context: string;
    question: string;
    conversationId: string;
  }) => ipcRenderer.send(IPC_CHANNELS.OPEN_CONSOLE_NUDGE_FORM, data),

  // Screenshot capture - for workflow visual guidance
  // Supports conditional capture with heuristics when message and context provided
  // Returns {dataUrl: string, metadata: ScreenshotMetadata} or null on failure/not needed
  captureScreenshot: (payload?: {
    message?: string;
    context?: {
      hasActiveWorkflow: boolean;
      lastMessageType?: string;
      messageCount: number;
      lastMessageHadCardData?: boolean;
    };
  }): Promise<{
    dataUrl: string;
    metadata: {
      width: number;
      height: number;
      timestamp: number;
      boundingBoxes?: unknown[];
      window?: unknown;
    };
  } | null> => {
    console.log("[Conversation Preload] captureScreenshot() called from renderer", {
      hasMessage: !!payload?.message,
      hasContext: !!payload?.context,
    });
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT, payload);
  },

  // Auth management - Conversation requests token from main process
  getAuthToken: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_TOKEN),
  // Returns cleanup function to remove listener
  onAuthTokenUpdated: (callback: (token: string | null) => void) => {
    const handler = (_event: any, token: string | null) => {
      callback(token);
    };

    ipcRenderer.on(IPC_CHANNELS.AUTH_TOKEN_UPDATED, handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTH_TOKEN_UPDATED, handler);
    };
  },
});
