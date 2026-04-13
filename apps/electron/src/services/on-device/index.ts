/**
 * On-Device Inference Module
 *
 * Barrel export for the local AI pipeline services.
 */

export { modelManager } from "./modelManager";
export type {
  AssetId,
  DownloadProgress,
  NvidiaInferenceTuning,
  Platform,
} from "./modelManager";

export { llamaServerService } from "./llamaServerService";
export type { LlamaServerConfig } from "./llamaServerService";

export { whisperServerService } from "./whisperServerService";
export type { WhisperServerConfig } from "./whisperServerService";

export { localDb } from "./localDb";
export type { LocalCapture, LocalClassification, LocalStory, LocalTranscription } from "./localDb";

export { localInferenceService } from "./localInferenceService";
export type { BufferedFrame, OnDeviceSummary } from "./localInferenceService";

export { localAudioService } from "./localAudioService";

export {
  startOnDeviceServersAtomic,
  stopOnDeviceServersBoth,
} from "./onDeviceServerLifecycle";
