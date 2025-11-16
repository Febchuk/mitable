import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

interface BoundingBox {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  width: number; // Normalized 0-1
  height: number; // Normalized 0-1
}

interface AnnotationOptions {
  label: string; // Element description
  confidence: number; // 0-1
  instruction?: string; // User's original question or step description
  clarifiedDescription?: string; // Phase 1: Detailed visual description of what to look for
  elementType?: string; // button, input, etc.
}

export class ScreenshotAnnotator {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir =
      outputDir || process.env.DEBUG_SCREENSHOTS_DIR || "/tmp/mitable-debug-screenshots";
  }

  // Main annotation function
  async annotate(
    screenshotBase64: string,
    boundingBox: BoundingBox,
    imageDimensions: { width: number; height: number },
    options: AnnotationOptions
  ): Promise<{
    sessionDir: string;
    originalPath: string;
    annotatedPath: string;
    jsonPath: string;
  }> {
    // 1. Generate timestamp for session directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sessionDir = path.join(this.outputDir, timestamp);

    // 2. Create session directory
    await mkdir(sessionDir, { recursive: true });

    // 3. Decode base64 to buffer
    const imageBuffer = Buffer.from(
      screenshotBase64.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    // 4. Save original screenshot
    const originalPath = path.join(sessionDir, "original.png");
    await writeFile(originalPath, imageBuffer);

    // 5. Convert normalized coordinates to pixels
    const pixelBox = this.normalizedToPixels(boundingBox, imageDimensions);

    // 6. Validate and clamp coordinates
    const validBox = this.clampToImageBounds(pixelBox, imageDimensions);

    // 7. Build SVG overlay with bounding box
    const svgOverlay = this.buildSVGOverlay(validBox, imageDimensions, options);

    // 8. Composite SVG onto image using Sharp
    const annotatedBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    // 9. Save annotated screenshot
    const annotatedPath = path.join(sessionDir, "annotated.png");
    await writeFile(annotatedPath, annotatedBuffer);

    // 10. Save analysis JSON
    const jsonPath = path.join(sessionDir, "analysis.json");
    const analysisData = {
      timestamp: new Date().toISOString(),
      instruction: options.instruction,
      clarifiedDescription: options.clarifiedDescription, // Phase 1: What Gemini was asked to find
      whatGeminiWasAskedToFind: options.clarifiedDescription || options.instruction,
      element: {
        label: options.label,
        type: options.elementType,
        confidence: options.confidence,
        boundingBox: {
          normalized: boundingBox,
          pixels: validBox,
        },
      },
      screenshot: {
        dimensions: imageDimensions,
        files: {
          original: "original.png",
          annotated: "annotated.png",
          analysis: "analysis.json",
        },
      },
    };
    await writeFile(jsonPath, JSON.stringify(analysisData, null, 2));

    // 11. Log to console for easy access
    console.log("\n[DEBUG SCREENSHOT]");
    console.log(`  Session:   ${sessionDir}`);
    console.log(`  Element:   ${options.label} (${(options.confidence * 100).toFixed(0)}%)`);
    console.log(`  Files:     original.png, annotated.png, analysis.json\n`);

    return { sessionDir, originalPath, annotatedPath, jsonPath };
  }

  // Convert normalized (0-1) to pixel coordinates
  private normalizedToPixels(
    box: BoundingBox,
    dimensions: { width: number; height: number }
  ): BoundingBox {
    return {
      x: box.x * dimensions.width,
      y: box.y * dimensions.height,
      width: box.width * dimensions.width,
      height: box.height * dimensions.height,
    };
  }

  // Clamp coordinates to image bounds
  private clampToImageBounds(
    box: BoundingBox,
    dimensions: { width: number; height: number }
  ): BoundingBox {
    const x = Math.max(0, Math.min(box.x, dimensions.width));
    const y = Math.max(0, Math.min(box.y, dimensions.height));
    const width = Math.min(box.width, dimensions.width - x);
    const height = Math.min(box.height, dimensions.height - y);

    return { x, y, width, height };
  }

  // Build SVG overlay with bounding box and labels
  private buildSVGOverlay(
    box: BoundingBox,
    dimensions: { width: number; height: number },
    options: AnnotationOptions
  ): string {
    const svgElements: string[] = [];

    // Main bounding box (green with semi-transparent fill)
    svgElements.push(`
      <rect
        x="${box.x}"
        y="${box.y}"
        width="${box.width}"
        height="${box.height}"
        fill="rgba(76, 175, 80, 0.2)"
        stroke="#4CAF50"
        stroke-width="4"
        stroke-dasharray="10,5" />
    `);

    // Label with confidence
    const labelText = `${options.label} (${(options.confidence * 100).toFixed(0)}%)`;
    const labelWidth = labelText.length * 9;
    const labelHeight = 28;
    const labelPadding = 8;

    // Position label above box if there's space, otherwise below
    const labelY = box.y > labelHeight + 10 ? box.y - labelHeight - 5 : box.y + box.height + 5;

    svgElements.push(`
      <rect
        x="${box.x}"
        y="${labelY}"
        width="${labelWidth}"
        height="${labelHeight}"
        fill="#4CAF50"
        rx="4" />
      <text
        x="${box.x + labelPadding}"
        y="${labelY + 19}"
        font-family="Arial, sans-serif"
        font-size="14"
        font-weight="bold"
        fill="white">
        ${this.escapeXml(labelText)}
      </text>
    `);

    // Instruction overlay (top-left corner, if provided)
    if (options.instruction) {
      const instructionText = this.truncateText(options.instruction, 50);
      const instructionWidth = Math.min(500, instructionText.length * 8 + 40);

      svgElements.push(`
        <rect
          x="20"
          y="20"
          width="${instructionWidth}"
          height="70"
          fill="rgba(0, 0, 0, 0.85)"
          stroke="#2196F3"
          stroke-width="2"
          rx="8" />
        <text
          x="32"
          y="45"
          font-family="Arial, sans-serif"
          font-size="14"
          font-weight="bold"
          fill="#2196F3">
          🎯 USER INSTRUCTION
        </text>
        <text
          x="32"
          y="68"
          font-family="Arial, sans-serif"
          font-size="13"
          fill="white">
          ${this.escapeXml(instructionText)}
        </text>
      `);
    }

    // Coordinate info (bottom-right corner)
    const coordText = `Box: (${box.x.toFixed(0)}, ${box.y.toFixed(0)}, ${box.width.toFixed(0)}×${box.height.toFixed(0)})`;
    const coordWidth = coordText.length * 7 + 20;
    const coordX = dimensions.width - coordWidth - 20;
    const coordY = dimensions.height - 50;

    svgElements.push(`
      <rect
        x="${coordX}"
        y="${coordY}"
        width="${coordWidth}"
        height="30"
        fill="rgba(0, 0, 0, 0.7)"
        rx="4" />
      <text
        x="${coordX + 10}"
        y="${coordY + 20}"
        font-family="monospace"
        font-size="12"
        fill="#FFF">
        ${this.escapeXml(coordText)}
      </text>
    `);

    return `
      <svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
        ${svgElements.join("\n")}
      </svg>
    `;
  }

  // Helper: Escape XML special characters
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Helper: Truncate text with ellipsis
  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
  }
}
