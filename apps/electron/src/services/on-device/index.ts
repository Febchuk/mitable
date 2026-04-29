/**
 * On-Device Inference Module
 *
 * Barrel export for the Ollama-based local AI pipeline.
 */

export { modelManager } from "./modelManager";

export { ollamaService } from "./ollamaService";
export type { ChatMessage, ContentPart, OllamaProgressCallback } from "./ollamaService";

export { detectHardware } from "./hardwareDetector";
export type { HardwareProfile, HardwareTier } from "./hardwareDetector";

export {
  initialize as initializeOllama,
  shutdown as shutdownOllama,
  getTier,
  getCapabilities,
  getHardwareProfile,
} from "./ollamaLifecycle";

export { whisperServerService } from "./whisperServerService";

export { localDb } from "./localDb";
export type {
  LocalCapture,
  LocalClassification,
  LocalStory,
  LocalTranscription,
  TranscriptionSource,
} from "./localDb";

export { localInferenceService } from "./localInferenceService";
export type { BufferedFrame, OnDeviceSummary } from "./localInferenceService";

export { localAudioService } from "./localAudioService";

export { nativeAudioCapture } from "./nativeAudioCapture";
export type { NativeAudioChunk } from "./nativeAudioCapture";
