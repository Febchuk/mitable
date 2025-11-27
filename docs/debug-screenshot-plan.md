# Debug Screenshot Visualization with Bounding Boxes

## Goal

Add debug mode that saves original screenshots + annotated versions with bounding boxes when `DEBUG_SAVE_SCREENSHOTS=true`

---

## Phase 1: Environment & Configuration Setup

### 1.1 Add Environment Variable

**File**: `/apps/backend/.env.example`

```env
# Debug mode - saves screenshots with bounding box annotations
DEBUG_SAVE_SCREENSHOTS=false
DEBUG_SCREENSHOTS_DIR=/tmp/mitable-debug-screenshots
```

**File**: `/apps/backend/.env`

- Add same variables with `DEBUG_SAVE_SCREENSHOTS=true` for your local testing

### 1.2 Update Package Scripts

**File**: Root `package.json`

```json
"scripts": {
  "dev": "turbo run dev",
  "dev:debug-screenshots": "DEBUG_SAVE_SCREENSHOTS=true turbo run dev"
}
```

**Usage**:

- Normal mode: `npm run dev`
- Debug mode: `npm run dev:debug-screenshots`

---

## Phase 2: Create Screenshot Annotator Utility

### 2.1 Create New Utility File

**File**: `/apps/backend/src/utils/screenshot-annotator.ts`

**Functionality**:

```typescript
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
  instruction?: string; // User's original question
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
  ): Required<BoundingBox> {
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
  ): Required<BoundingBox> {
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
```

---

## Phase 3: Integrate into Message Stream Endpoint

### 3.1 Modify Conversations Route

**File**: `/apps/backend/src/routes/conversations.ts`

**Import annotator**:

```typescript
import { ScreenshotAnnotator } from "../utils/screenshot-annotator";
```

**After Gemini Vision analysis** (around line 180-200 in POST `/api/conversations/:id/messages/stream`):

```typescript
// Existing code: Parse vision result
const parsed = visionResult.parsed || visionResult;

// NEW: Debug screenshot saving
if (
  process.env.DEBUG_SAVE_SCREENSHOTS === "true" &&
  parsed.recommendedAction?.element?.boundingBox
) {
  try {
    const annotator = new ScreenshotAnnotator();

    const [primaryScreenshot] = screenshots || [];

    await annotator.annotate(
      primaryScreenshot?.dataUrl ?? "", // base64 screenshot
      parsed.recommendedAction.element.boundingBox, // normalized bounding box
      {
        width: primaryScreenshot?.metadata.width ?? 1920,
        height: primaryScreenshot?.metadata.height ?? 1080,
      },
      {
        label: parsed.recommendedAction.element.description || "Target Element",
        confidence: parsed.recommendedAction.element.confidence || 0.5,
        instruction: content, // User's original message
        elementType: parsed.recommendedAction.element.type,
      }
    );
  } catch (error) {
    console.error("[DEBUG SCREENSHOT] Failed to save annotated screenshot:", error);
    // Don't fail the request, just log the error
  }
}
```

---

## Phase 4: Add Sharp Dependency

### 4.1 Install Sharp

**File**: `/apps/backend/package.json`

Add to dependencies:

```json
{
  "dependencies": {
    "sharp": "^0.33.5"
  }
}
```

**Run installation**:

```bash
npm install --workspace=apps/backend
```

---

## Phase 5: Testing & Validation

### 5.1 Manual Testing Flow

**1. Enable debug mode**:

```bash
npm run dev:debug-screenshots
```

**2. Trigger workflow with visual guidance**:

- Open Agent Pill
- Type: "Show me how to click the submit button"
- Submit message

**3. Check debug output**:

```bash
ls -lh /tmp/mitable-debug-screenshots/
# Should see folder structure like:
# 2025-11-06T15-30-45-123Z/
#   ├── original.png
#   ├── annotated.png
#   └── analysis.json
```

**4. Verify annotated screenshot**:

- Open `annotated.png` in image viewer
- Check that green bounding box is drawn at correct position
- Verify label shows element description + confidence
- Confirm user instruction appears in top-left overlay
- Check coordinates display in bottom-right

**5. Verify JSON output**:

```bash
cat /tmp/mitable-debug-screenshots/2025-11-06T15-30-45-123Z/analysis.json
# Should contain:
# - timestamp
# - instruction
# - element details (label, type, confidence, bounding box)
# - screenshot dimensions
# - file paths
```

### 5.2 Test Cases

**Test Case 1: Button Detection**

- Instruction: "Click the save button"
- Expected: Green box around save button, correct coordinates

**Test Case 2: Input Field**

- Instruction: "Type in the email field"
- Expected: Green box around email input, correct position

**Test Case 3: Multi-Monitor**

- Test on secondary display
- Verify coordinates scale correctly

**Test Case 4: HiDPI Display**

- Test on Retina display
- Verify scaleFactor is handled correctly

**Test Case 5: Edge Cases**

- Box at edge of screen (x=0 or y=0)
- Box near bottom-right corner
- Very small elements (<20px)
- Very large elements (>50% of screen)

---

## Phase 6: Documentation

### 6.1 Update CLAUDE.md

Add section under "Screenshot Capture Service":

````markdown
### Debug Mode

Enable debug screenshot saving to visualize bounding box accuracy:

```bash
npm run dev:debug-screenshots
```
````

When enabled, every screenshot analysis saves 3 files grouped by timestamp folder in `/tmp/mitable-debug-screenshots/`:

```
/tmp/mitable-debug-screenshots/
  └── 2025-11-06T15-30-45-123Z/
      ├── original.png      # Original screenshot
      ├── annotated.png     # Screenshot with green bounding box overlay
      └── analysis.json     # Full Gemini Vision response and metadata
```

The annotated screenshot includes:

- Green bounding box around target element (4px dashed border)
- Label with element description and confidence percentage
- User instruction overlay (top-left)
- Pixel coordinates display (bottom-right)

Use this to debug coordinate accuracy and visual guidance positioning.

```

---

## File Summary

### New Files
- `/apps/backend/src/utils/screenshot-annotator.ts` (320 lines)

### Modified Files
- `/apps/backend/.env.example` (add 2 env vars)
- `/apps/backend/.env` (add 2 env vars)
- `package.json` (add 1 script)
- `/apps/backend/package.json` (add sharp dependency)
- `/apps/backend/src/routes/conversations.ts` (add ~20 lines)
- `/CLAUDE.md` (add documentation section)

### Dependencies Added
- `sharp@^0.33.5` (image processing)

---

## Expected Output Example

### Console Output
```

[DEBUG SCREENSHOT]
Session: /tmp/mitable-debug-screenshots/2025-11-06T15-30-45-123Z
Element: Submit Button (92%)
Files: original.png, annotated.png, analysis.json

```

### Folder Structure
```

/tmp/mitable-debug-screenshots/
├── 2025-11-06T15-30-45-123Z/
│ ├── original.png
│ ├── annotated.png
│ └── analysis.json
├── 2025-11-06T15-31-12-456Z/
│ ├── original.png
│ ├── annotated.png
│ └── analysis.json
└── 2025-11-06T15-32-03-789Z/
├── original.png
├── annotated.png
└── analysis.json

```

### Annotated Screenshot Features
- Green dashed rectangle around target element
- Label: "Submit Button (92%)"
- Top-left overlay: "🎯 USER INSTRUCTION: Click the submit button"
- Bottom-right: "Box: (864, 129, 288×43)"

---

## Performance Impact

**When DEBUG_SAVE_SCREENSHOTS=false** (production):
- Zero overhead (no code executed)

**When DEBUG_SAVE_SCREENSHOTS=true** (development):
- ~100-200ms additional latency per screenshot
- ~2-5MB disk space per screenshot session
- No impact on frontend or AI pipeline

---

## Next Steps After Implementation

1. **Validate coordinate accuracy**: Measure pixel deviation from actual UI elements
2. **Identify patterns**: Are certain element types less accurate?
3. **Prompt optimization**: Adjust Gemini Vision prompts if needed
4. **Decide on architecture change**: Based on accuracy results, determine if two-call approach is needed
```
