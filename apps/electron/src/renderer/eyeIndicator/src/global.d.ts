// Global type declarations for Eye Indicator window preload API

interface EyeIndicatorAPI {
  moveWindow: (deltaX: number, deltaY: number) => void;
}

declare global {
  interface Window {
    eyeIndicatorAPI: EyeIndicatorAPI;
  }
}

export {};

