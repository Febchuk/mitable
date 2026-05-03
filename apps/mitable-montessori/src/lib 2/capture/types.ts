export type CaptureMode = "text" | "voice" | "photo";

export type WorkerStatus =
  | { state: "idle" }
  | { state: "loading"; progress: number; message: string }
  | { state: "ready" }
  | { state: "running" }
  | { state: "error"; message: string };

export interface TranscriptionResult {
  text: string;
  durationMs: number;
  confidence?: number;
}

export interface OcrResult {
  text: string;
  durationMs: number;
  confidence?: number;
}

export interface AsrEngine {
  init(opts?: { onProgress?: (status: WorkerStatus) => void }): Promise<void>;
  transcribe(audio: Float32Array, sampleRate: number): Promise<TranscriptionResult>;
  isReady(): boolean;
  destroy(): void;
}

export interface OcrEngine {
  init(opts?: { onProgress?: (status: WorkerStatus) => void }): Promise<void>;
  recognize(image: Blob | ImageData): Promise<OcrResult>;
  isReady(): boolean;
  destroy(): void;
}
