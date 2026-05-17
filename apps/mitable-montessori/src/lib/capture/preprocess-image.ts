/**
 * Browser-side image preprocessing for OCR, ported from the backend's
 * Sharp-based pipeline (pii-redaction.service.ts). Uses OffscreenCanvas
 * + ImageData pixel manipulation since Sharp isn't available in workers.
 *
 * Produces three variants of the input image optimized for Tesseract:
 *   1. Simple: greyscale → normalize → sharpen
 *   2. Aggressive: greyscale → normalize → high-contrast → binary threshold
 *   3. Upscaled: 2× resize → greyscale → normalize → sharpen
 *
 * The caller runs OCR on each and picks the best result by confidence.
 */

export interface PreprocessedVariant {
  label: string;
  blob: Blob;
  scale: number;
}

export async function preprocessForOCR(source: Blob): Promise<PreprocessedVariant[]> {
  const bitmap = await createImageBitmap(source);
  const { width, height } = bitmap;

  const variants: PreprocessedVariant[] = [];

  // --- Pass 1: Simple (greyscale → normalize → sharpen) ---
  const simple = createCanvas(width, height);
  simple.ctx.drawImage(bitmap, 0, 0);
  const simpleData = simple.ctx.getImageData(0, 0, width, height);
  greyscale(simpleData);
  normalize(simpleData);
  sharpen(simpleData, width, height);
  simple.ctx.putImageData(simpleData, 0, 0);
  variants.push({
    label: "simple",
    blob: await simple.canvas.convertToBlob({ type: "image/png" }),
    scale: 1,
  });

  // --- Pass 2: Aggressive contrast (greyscale → normalize → linear → threshold) ---
  const aggressive = createCanvas(width, height);
  aggressive.ctx.drawImage(bitmap, 0, 0);
  const aggressiveData = aggressive.ctx.getImageData(0, 0, width, height);
  greyscale(aggressiveData);
  normalize(aggressiveData);
  linearContrast(aggressiveData, 1.5, -50);
  threshold(aggressiveData, 140);
  aggressive.ctx.putImageData(aggressiveData, 0, 0);
  variants.push({
    label: "aggressive",
    blob: await aggressive.canvas.convertToBlob({ type: "image/png" }),
    scale: 1,
  });

  // --- Pass 3: 2× upscale → greyscale → normalize → sharpen ---
  const w2 = width * 2;
  const h2 = height * 2;
  const upscaled = createCanvas(w2, h2);
  upscaled.ctx.imageSmoothingEnabled = true;
  upscaled.ctx.imageSmoothingQuality = "high";
  upscaled.ctx.drawImage(bitmap, 0, 0, w2, h2);
  const upscaledData = upscaled.ctx.getImageData(0, 0, w2, h2);
  greyscale(upscaledData);
  normalize(upscaledData);
  sharpen(upscaledData, w2, h2);
  upscaled.ctx.putImageData(upscaledData, 0, 0);
  variants.push({
    label: "upscaled",
    blob: await upscaled.canvas.convertToBlob({ type: "image/png" }),
    scale: 2,
  });

  bitmap.close();
  return variants;
}

function createCanvas(w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

function greyscale(data: ImageData): void {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = g;
  }
}

function normalize(data: ImageData): void {
  const px = data.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < px.length; i += 4) {
    const v = ((px[i] - min) / range) * 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

function linearContrast(data: ImageData, gain: number, bias: number): void {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, px[i] * gain + bias));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

function threshold(data: ImageData, t: number): void {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i] >= t ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

/** Unsharp-mask-style sharpen using a 3×3 Laplacian kernel. */
function sharpen(data: ImageData, w: number, h: number): void {
  const src = new Uint8ClampedArray(data.data);
  const dst = data.data;
  const strength = 0.5;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const center = src[idx];
      const neighbors =
        src[idx - w * 4] +
        src[idx + w * 4] +
        src[idx - 4] +
        src[idx + 4];
      const laplacian = center * 4 - neighbors;
      const v = Math.max(0, Math.min(255, center + laplacian * strength));
      dst[idx] = dst[idx + 1] = dst[idx + 2] = v;
    }
  }
}
