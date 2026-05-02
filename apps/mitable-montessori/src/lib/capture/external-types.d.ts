// Ambient declarations for the optional ML deps consumed by capture.worker.ts.
// These packages are loaded via dynamic import — guarded at runtime — so the
// app builds and ships without them being installed. When they are installed
// (real Whisper / Tesseract integration), their bundled types take over.

declare module "@xenova/transformers" {
  export const pipeline: (
    task: string,
    model: string,
    opts?: Record<string, unknown>
  ) => Promise<unknown>;
}

declare module "tesseract.js" {
  export const createWorker: (
    lang?: string,
    oem?: number,
    opts?: { logger?: (m: { status: string; progress: number }) => void }
  ) => Promise<unknown>;
}
