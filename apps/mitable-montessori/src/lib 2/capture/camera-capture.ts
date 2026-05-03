"use client";

/**
 * In-app camera capture. Enforces FR-4: photos must come from the live camera,
 * not a gallery picker, so teachers cannot inadvertently upload images that
 * contain other students. Returns a Blob (image/jpeg).
 */

export interface CameraSession {
  stream: MediaStream;
  capture(): Promise<Blob>;
  stop(): void;
}

export async function startCamera(
  opts: { facingMode?: "user" | "environment" } = {}
): Promise<CameraSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: opts.facingMode ?? "environment" },
    audio: false,
  });

  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    stream,
    async capture() {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(w, h)
          : Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
      if (!ctx) throw new Error("2D context unavailable.");
      ctx.drawImage(video, 0, 0, w, h);
      if (canvas instanceof OffscreenCanvas) {
        return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      }
      return await new Promise<Blob>((resolve, reject) => {
        (canvas as HTMLCanvasElement).toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
          "image/jpeg",
          0.85
        );
      });
    },
    stop,
  };
}
