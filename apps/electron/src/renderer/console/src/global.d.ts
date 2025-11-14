// Global type declarations for Electron preload API

import type { MultiWindowCaptureResult } from "@mitable/shared";

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
  sendToAgent: (conversationId: string) => void; // NEW: Send conversation to Agent window

  // Window management
  minimizeWindow: () => void;

  // Navigation
  onNavigateToChat: (callback: (conversationId: string) => void) => void;

  // Nudge creator
  onNudgeOpenCreator: (callback: (data: unknown) => void) => void;

  // Auth management
  setAuthTokens: (accessToken: string, refreshToken: string) => void;
  clearAuthTokens: () => void;
  onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
}

declare global {
  interface Window {
    consoleAPI: ConsoleAPI;
  }
}

export {};
