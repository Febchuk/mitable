// Global type declarations for Observation Modal window preload API

interface ObservationAPI {
  startSession: () => void;
  endSession: () => void;
  cancel: () => void;
}

declare global {
  interface Window {
    observationAPI: ObservationAPI;
  }
}

export {};

