// Global type declarations for Electron preload API

interface ConsoleAPI {
  // Help system
  requestHelp: (data: unknown) => void;
  onHelpResponse: (callback: (data: unknown) => void) => void;

  // Screenshot capture
  captureScreenshot: () => Promise<string | null>;

  // Guide system
  startGuide: (data: unknown) => void;
  onGuideData: (callback: (data: unknown) => void) => void;

  // Conversation management
  newConversation: () => void;
  loadConversation: (id: string) => void;

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
