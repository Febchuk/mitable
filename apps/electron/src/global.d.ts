/// <reference types="vite/client" />

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

declare module "*.gif" {
  const content: string;
  export default content;
}

// Electron Window APIs
declare global {
  interface Window {
    // Console API (Console renderer)
    consoleAPI: {
      requestHelp: (data: unknown) => void;
      onHelpResponse: (callback: (data: unknown) => void) => void;
      captureScreenshot: () => Promise<{ dataUrl: string; metadata: any } | null>;
      startGuide: (data: unknown) => void;
      onGuideData: (callback: (data: unknown) => void) => void;
      newConversation: () => void;
      loadConversation: (id: string) => void;
      sendToAgent: (conversationId: string) => void;
      minimizeWindow: () => void;
      onNavigateToChat: (callback: (conversationId: string) => void) => void;
      onNudgeOpenCreator: (callback: (data: unknown) => void) => void;
      setAuthTokens: (accessToken: string, refreshToken: string) => void;
      clearAuthTokens: () => void;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
    };

    // Conversation API (Conversation renderer)
    conversationAPI: {
      hideWindow: () => void;
      setViewState: (state: "hidden" | "collapsed" | "expanded") => void;
      onViewStateChange: (callback: (state: "hidden" | "collapsed" | "expanded") => void) => () => void;
      onConversationLoad: (callback: (conversationId: string) => void) => () => void;
      switchConversation: (conversationId: string) => void;
      requestConversationList: () => void;
      onConversationList: (callback: (conversations: any[]) => void) => () => void;
      onMessageReceived: (
        callback: (message: any, screenshot: string | null, screenshotMetadata?: any) => void
      ) => () => void;
      updateMessages: (messages: any[]) => void;
      onPositionUpdate: (callback: (x: number, y: number) => void) => () => void;
      showNudge: (data: unknown) => void;
      startGuide: (data: unknown) => void;
      openConversationInConsole: (conversationId: string) => void;
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
      }) => void;
      captureScreenshot: (payload?: {
        message?: string;
        context?: {
          hasActiveWorkflow: boolean;
          lastMessageType?: string;
          messageCount: number;
          lastMessageHadCardData?: boolean;
        };
      }) => Promise<{
        dataUrl: string;
        metadata: {
          width: number;
          height: number;
          timestamp: number;
          boundingBoxes?: unknown[];
          window?: unknown;
        };
      } | null>;
      getAuthToken: () => Promise<string | null>;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => () => void;
    };
  }
}

export {};
