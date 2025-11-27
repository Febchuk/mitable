interface WatchButtonSelectPayload {
  windowId: string;
  appName: string;
  windowTitle: string;
}

interface WatchButtonAPI {
  selectWindow: (
    windowInfo: WatchButtonSelectPayload
  ) => Promise<{ allowed: boolean; reason?: string }>;
}

declare global {
  interface Window {
    watchButtonAPI?: WatchButtonAPI;
  }
}

export {};
