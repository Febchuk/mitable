// Global type declarations for Electron preload API

import type { MultiWindowCaptureResult, SelectedWindowInfo } from "@mitable/shared";

interface ConsoleAPI {
  // Help system
  requestHelp: (data: unknown) => void;
  onHelpResponse: (callback: (data: unknown) => void) => void;

  // Screenshot capture - multi-window capture with policy filtering
  captureScreenshot: () => Promise<MultiWindowCaptureResult>;

  // Guide system
  startGuide: (data: unknown) => void;
  onGuideData: (callback: (data: unknown) => void) => void;

  // Conversation management
  newConversation: () => void;
  loadConversation: (id: string) => void;
  sendToAgent: (conversationId: string) => void; // Legacy: Send to old Agent window
  sendToAgentPanel: (conversationId: string) => void; // NEW: Send to Agent Panel

  // Window management
  minimizeWindow: () => void;

  // Navigation
  onNavigateToChat: (callback: (conversationId: string) => void) => void;

  // Nudge creator
  onNudgeOpenCreator: (callback: (data: unknown) => void) => void;

  // Drafts navigation (Update Buddy)
  onDraftsNavigate: (callback: (draftId: string) => void) => void;

  // Auth management
  setAuthTokens: (accessToken: string, refreshToken: string) => void;
  clearAuthTokens: () => void;
  onAuthTokenUpdated: (callback: (token: string | null) => void) => void;

  // Watch mode for selective screenshot capture
  toggleWatchMode: (enabled: boolean) => Promise<void>;
  unselectWindow: (windowId: string) => Promise<void>;
  getSelectedWindows: () => Promise<SelectedWindowInfo[]>;
  onWatchWindowsUpdated: (
    callback: (windows: SelectedWindowInfo[]) => void
  ) => () => void;

  // Watching pill control
  showWatchingPill: () => void;
  hideWatchingPill: () => void;
  toggleWatchingPill: () => void;
}

declare global {
  interface Window {
    consoleAPI: ConsoleAPI;
  }
}

export {};
