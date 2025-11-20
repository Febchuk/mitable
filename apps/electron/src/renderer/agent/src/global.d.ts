// Global type declarations for Agent window preload API

import type { SelectedWindowInfo } from "@mitable/shared";

interface AgentAPI {
  // Window control
  toggle: () => void;
  showConsole: () => void;
  setIgnoreMouseEvents: (ignore: boolean) => void;
  resizeWindow: (
    options:
      | { width?: number; height?: number }
      | "pill"
      | "conversation"
      | "text-mode"
      | "audio-mode"
  ) => void;

  // Conversation window management
  showConversation: () => void;
  hideConversation: () => void;
  toggleConversation: () => void;
  sendMessageToConversation: (messageData: any, screenshot: string | null) => void;
  openConversationInConsole: (conversationId: string) => void;

  // Nudge and guide
  showNudge: (data: unknown) => void;
  startGuide: (data: unknown) => void;

  // Screenshot capture
  captureScreenshot: () => Promise<{
    dataUrl: string;
    metadata: {
      width: number;
      height: number;
      scaleFactor: number;
      captureMode: string;
      timestamp: number;
    };
  } | null>;

  // Auth management
  getAuthToken: () => Promise<string | null>;
  onAuthTokenUpdated: (callback: (token: string | null) => void) => void;

  // Guide events
  onGuideNextStep: (callback: () => void) => void;

  // Watch mode for selective screenshot capture
    toggleWatchMode: (enabled: boolean) => Promise<void>;
    unselectWindow: (windowId: string) => Promise<void>;
    getSelectedWindows: () => Promise<SelectedWindowInfo[]>;
    onWatchWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void) => void;
    offWatchWindowsUpdated: (callback: (windows: SelectedWindowInfo[]) => void) => void;
}

declare global {
  interface Window {
    agentAPI: AgentAPI;
  }
}

export {};