/**
 * Debug Screenshot Renderer
 * Draws bounding boxes and debug information on screenshots for visual debugging
 */

import * as sharpModule from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { debugVisualizationConfig } from '../config/debug-visualization.config.js';

const sharp = sharpModule.default || sharpModule;

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DebugScreenshotOptions {
  screenshot: string; // Base64 data URL
  boundingBox: BoundingBox;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  stepDescription: string;
  metadata?: {
    width: number;
    height: number;
    [key: string]: any;
  };
}

/**
 * Renders a debug screenshot with bounding box and annotations
 * @param options Debug screenshot rendering options
 * @returns Path to the saved debug screenshot
 */
export async function renderDebugScreenshot(
  options: DebugScreenshotOptions
): Promise<string> {
  try {
    const { screenshot, boundingBox, label, confidence, stepDescription, metadata } = options;

    // Convert base64 to buffer
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Load image and get dimensions
    const image = sharp(imageBuffer);
    const { width, height } = await image.metadata();

    if (!width || !height) {
      throw new Error('Could not determine image dimensions');
    }

    // Validate and clamp bounding box coordinates
    const box = validateBoundingBox(boundingBox, width, height);

    // Create SVG overlay
    const svgOverlay = createSvgOverlay(
      width,
      height,
      box,
      label,
      confidence,
      stepDescription
    );

    // Composite image with SVG overlay
    const result = await image
      .composite([
        {
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    // Save to debug directory
    const outputPath = await saveDebugImage(result, metadata);

    console.log(`[DebugScreenshot] Saved to: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error('[DebugScreenshot] Error rendering debug screenshot:', error);
    throw error;
  }
}

/**
 * Validates and clamps bounding box to image dimensions
 */
function validateBoundingBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number
): BoundingBox {
  return {
    x: Math.max(0, Math.min(box.x, imageWidth - 1)),
    y: Math.max(0, Math.min(box.y, imageHeight - 1)),
    width: Math.max(1, Math.min(box.width, imageWidth - box.x)),
    height: Math.max(1, Math.min(box.height, imageHeight - box.y)),
  };
}

/**
 * Creates SVG overlay with bounding box and annotations
 */
function createSvgOverlay(
  width: number,
  height: number,
  box: BoundingBox,
  label: string,
  confidence: string,
  stepDescription: string
): string {
  const config = debugVisualizationConfig;
  const svgElements: string[] = [];

  // 1. Bounding box rectangle
  svgElements.push(`
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"
          fill="${hexToRgba(config.boundingBox.color, config.boundingBox.fillOpacity)}"
          stroke="${config.boundingBox.color}"
          stroke-width="${config.boundingBox.strokeWidth}" />
  `);

  // 2. Element label (above or below box)
  const labelText = escapeHtml(label);
  const labelHeight = config.text.fontSize + config.text.padding * 2;
  const labelWidth = labelText.length * (config.text.fontSize * 0.6) + config.text.padding * 2;

  let labelY = box.y - labelHeight - 5;
  if (labelY < 0) {
    labelY = box.y + box.height + 5;
  }

  // Label background
  svgElements.push(`
    <rect x="${box.x}" y="${labelY}" width="${labelWidth}" height="${labelHeight}"
          fill="${config.text.backgroundColor}" />
  `);

  // Label text
  svgElements.push(`
    <text x="${box.x + config.text.padding}"
          y="${labelY + config.text.fontSize + config.text.padding / 2}"
          font-family="${config.text.fontFamily}"
          font-size="${config.text.fontSize}"
          fill="${config.text.textColor}">
      ${labelText}
    </text>
  `);

  // 3. Confidence + Coordinates info (below label)
  const coordText = `${confidence} - x:${Math.round(box.x)}, y:${Math.round(box.y)}, w:${Math.round(box.width)}, h:${Math.round(box.height)}`;
  const coordTextEscaped = escapeHtml(coordText);
  const coordWidth = coordText.length * (config.text.fontSize * 0.6) + config.text.padding * 2;
  const coordHeight = config.text.fontSize + config.text.padding * 2;

  let coordY = labelY + labelHeight + 2;
  if (coordY + coordHeight > height) {
    coordY = labelY - coordHeight - 2;
  }

  // Coordinates background
  svgElements.push(`
    <rect x="${box.x}" y="${coordY}" width="${coordWidth}" height="${coordHeight}"
          fill="rgba(0, 0, 0, 0.8)" />
  `);

  // Coordinates text
  svgElements.push(`
    <text x="${box.x + config.text.padding}"
          y="${coordY + config.text.fontSize + config.text.padding / 2}"
          font-family="${config.text.fontFamily}"
          font-size="${config.text.fontSize - 2}"
          fill="#FFFFFF">
      ${coordTextEscaped}
    </text>
  `);

  // 4. Step description at top of image
  const stepLines = wrapText(stepDescription, config.stepDescription.maxWidth, config.stepDescription.fontSize);
  const stepBoxHeight = stepLines.length * (config.stepDescription.fontSize + 5) + config.stepDescription.padding * 2;
  const stepBoxWidth = Math.min(width - 20, config.stepDescription.maxWidth);

  // Step description background
  svgElements.push(`
    <rect x="10" y="10" width="${stepBoxWidth}" height="${stepBoxHeight}"
          fill="${config.stepDescription.backgroundColor}"
          rx="5" ry="5" />
  `);

  // Step description text (multi-line)
  stepLines.forEach((line, index) => {
    const lineY = 10 + config.stepDescription.padding + (index + 1) * (config.stepDescription.fontSize + 5);
    svgElements.push(`
      <text x="${10 + config.stepDescription.padding}"
            y="${lineY}"
            font-family="${config.stepDescription.fontFamily}"
            font-size="${config.stepDescription.fontSize}"
            font-weight="bold"
            fill="${config.stepDescription.textColor}">
        ${escapeHtml(line)}
      </text>
    `);
  });

  // Complete SVG
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgElements.join('')}
    </svg>
  `;
}

/**
 * Saves debug image to debug directory with timestamp
 */
async function saveDebugImage(
  imageBuffer: Buffer,
  metadata?: any
): Promise<string> {
  const debugDir = join(process.cwd(), 'apps', 'backend', 'debug');

  // Ensure directory exists
  try {
    await mkdir(debugDir, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }

  // Generate filename with timestamp
  const timestamp = Date.now();
  const stepNum = metadata?.stepNumber || 'unknown';
  const filename = `screenshot-${timestamp}-step${stepNum}.png`;
  const outputPath = join(debugDir, filename);

  // Save image
  await writeFile(outputPath, imageBuffer);

  return outputPath;
}

/**
 * Converts hex color to rgba
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Wraps text to fit within max width
 */
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charWidth = fontSize * 0.6; // Approximate character width
  const maxChars = Math.floor(maxWidth / charWidth);

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}
