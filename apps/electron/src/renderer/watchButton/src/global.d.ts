interface WatchButtonSelectPayload {
  windowId: string;
  appName: string;
  windowTitle: string;
}

interface WatchButtonAPI {
  selectWindow: (windowInfo: WatchButtonSelectPayload) => void;
}

declare global {
  interface Window {
    watchButtonAPI?: WatchButtonAPI;
  }
}

export {};
