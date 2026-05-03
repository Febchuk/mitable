"use client";

import type { OcrEngine, OcrResult, WorkerStatus } from "@/lib/capture/types";
import { WorkerHost, type WorkerHostOptions } from "@/lib/capture/worker-host";

export class TesseractOcrEngine implements OcrEngine {
  private host: WorkerHost;
  private ready = false;

  constructor(opts: WorkerHostOptions = {}) {
    this.host = new WorkerHost(opts);
  }

  async init(opts: { onProgress?: (status: WorkerStatus) => void } = {}) {
    if (opts.onProgress) {
      const proxy = new WorkerHost({
        onStatus: (s) => {
          opts.onProgress?.(s);
          if (s.state === "ready") this.ready = true;
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).host = proxy;
    }
    await this.host.ensureWorker();
  }

  async recognize(image: Blob | ImageData): Promise<OcrResult> {
    const buf = await blobOrImageDataToArrayBuffer(image);
    const mime = image instanceof Blob ? image.type || "image/png" : "image/png";
    const r = await this.host.recognize(buf, mime);
    this.ready = true;
    return r;
  }

  isReady() {
    return this.ready;
  }

  destroy() {
    this.host.destroy();
    this.ready = false;
  }
}

async function blobOrImageDataToArrayBuffer(image: Blob | ImageData): Promise<ArrayBuffer> {
  if (image instanceof Blob) return image.arrayBuffer();
  // ImageData → PNG via OffscreenCanvas if available, else a tight RGBA buffer.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const cctx = canvas.getContext("2d");
    if (cctx) {
      cctx.putImageData(image, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return blob.arrayBuffer();
    }
  }
  return image.data.buffer.slice(0);
}

/** Stub for tests / unsupported devices. */
export class StubOcrEngine implements OcrEngine {
  private ready = false;
  constructor(private script: (image: Blob | ImageData) => string = () => "") {}
  async init() {
    this.ready = true;
  }
  async recognize(image: Blob | ImageData): Promise<OcrResult> {
    return { text: this.script(image), durationMs: 1, confidence: 1 };
  }
  isReady() {
    return this.ready;
  }
  destroy() {
    this.ready = false;
  }
}
