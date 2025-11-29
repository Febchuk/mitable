import type { SelectedWindowInfo, MultiWindowCaptureResult } from "@mitable/shared";

export type { SelectedWindowInfo, MultiWindowCaptureResult };

export interface AgentPanelAPI {
  // Panel control
  toggle(): void;
  show(): void;
  hide(): void;
  resize(width: number): void;

  // Screenshot capture - returns multi-window capture result
  captureScreenshot(): Promise<MultiWindowCaptureResult>;

  // Watch mode
  toggleWatchMode(enabled: boolean): Promise<void>;
  unselectWindow(windowId: string): Promise<void>;
  getSelectedWindows(): Promise<SelectedWindowInfo[]>;
  onWatchWindowsUpdated(
    callback: (windows: SelectedWindowInfo[]) => void
  ): void;
  offWatchWindowsUpdated(
    callback: (windows: SelectedWindowInfo[]) => void
  ): void;

  // Auth
  getAuthToken(): Promise<string | null>;
  onAuthTokenUpdated(callback: (token: string | null) => void): void;

  // Console integration
  openInConsole(conversationId: string): void;
  openChats(): void;
  onLoadConversation(callback: (conversationId: string) => void): void;
  offLoadConversation(callback: (conversationId: string) => void): void;
}

declare global {
  interface Window {
    agentPanelAPI: AgentPanelAPI;
  }
}
