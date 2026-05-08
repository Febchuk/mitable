/**
 * On-Device Inference Module
 *
 * Barrel export for the Ollama-based local AI pipeline.
 */

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

export { sessionTimeline } from "./sessionTimeline";
export type {
  SessionTimelineData,
  TranscriptSegment,
  AudioSegmentMeta,
  FrameTimestamp,
} from "./sessionTimeline";

export { nativeAudioCapture } from "./nativeAudioCapture";
export type { NativeAudioChunk } from "./nativeAudioCapture";

export { whisperCliService } from "./whisperCliService";
export { whisperSetupService } from "./whisperSetupService";

export { hybridInferenceService } from "./hybridInferenceService";
export type { BatchAnalysisResult, InferenceTier } from "./hybridInferenceService";

export { keyVault } from "./keyVault";
export { createProvider } from "./providers";
export type { InferenceProvider, ProviderConfig, ProviderName } from "./providers";
