export * from "./types.js";
export * from "./ipc.js";
export * from "./guides.js";
export * from "./types/pii.js";
export * from "./documents.js";
export * from "./billing.js";
export * from "./pricing.js";
export * from "./session.js";
export * from "./workstream.js";
export * from "./date-context.js";

// Explicit type re-exports so downstream TS projects can import them reliably.
// (Some dts bundlers may elide type-only exports when only re-exported via `export *`.)
export type {
  MultiWindowCaptureResult,
  SelectedWindowInfo,
  WatchableWindow,
  MonitoringSessionState,
  OrgVariant,
  OrgSettings,
  VariantLabels,
} from "./types.js";
