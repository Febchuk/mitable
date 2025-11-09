/**
 * Coordinate Converter Service
 *
 * Converts between normalized (0.0-1.0) and pixel coordinate systems for bounding boxes.
 * Used to convert Gemini Vision API normalized coordinates to pixel coordinates for rendering.
 *
 * Gemini Vision API returns bounding boxes in normalized format (0.0-1.0 range):
 * - x: 0.0 = left edge, 1.0 = right edge
 * - y: 0.0 = top edge, 1.0 = bottom edge
 * - width/height = fraction of total dimensions
 *
 * Example:
 * Normalized: { x: 0.45, y: 0.12, width: 0.15, height: 0.04 }
 * For 1920x1080 screen:
 * Pixels: { x: 864, y: 129, width: 288, height: 43 }
 */

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

class CoordinateConverterService {
  /**
   * Convert normalized coordinates (0.0-1.0) to pixel coordinates
   *
   * @param normalizedBox - Bounding box with normalized coordinates (0.0-1.0)
   * @param imageDimensions - Image dimensions in pixels
   * @returns Bounding box with pixel coordinates, rounded and clamped to image bounds
   */
  convertToPixels(normalizedBox: BoundingBox, imageDimensions: ImageDimensions): BoundingBox {
    // Convert normalized (0-1) to pixels
    let x = normalizedBox.x * imageDimensions.width;
    let y = normalizedBox.y * imageDimensions.height;
    let width = normalizedBox.width * imageDimensions.width;
    let height = normalizedBox.height * imageDimensions.height;

    // Clamp position to screen bounds (prevent box from starting off-screen)
    x = Math.max(0, Math.min(x, imageDimensions.width - width));
    y = Math.max(0, Math.min(y, imageDimensions.height - height));

    // Clamp size to not exceed screen bounds
    width = Math.min(width, imageDimensions.width - x);
    height = Math.min(height, imageDimensions.height - y);

    // Round to avoid sub-pixel rendering issues
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  /**
   * Convert pixel coordinates to normalized coordinates (0.0-1.0)
   * Useful for round-trip testing and validation
   *
   * @param pixelBox - Bounding box with pixel coordinates
   * @param imageDimensions - Image dimensions in pixels
   * @returns Bounding box with normalized coordinates (0.0-1.0)
   */
  convertToNormalized(pixelBox: BoundingBox, imageDimensions: ImageDimensions): BoundingBox {
    return {
      x: pixelBox.x / imageDimensions.width,
      y: pixelBox.y / imageDimensions.height,
      width: pixelBox.width / imageDimensions.width,
      height: pixelBox.height / imageDimensions.height,
    };
  }

  /**
   * Validate that a bounding box has valid coordinates
   *
   * @param box - Bounding box to validate
   * @returns true if valid, false otherwise
   */
  validate(box: BoundingBox): boolean {
    return (
      typeof box.x === "number" &&
      typeof box.y === "number" &&
      typeof box.width === "number" &&
      typeof box.height === "number" &&
      !isNaN(box.x) &&
      !isNaN(box.y) &&
      !isNaN(box.width) &&
      !isNaN(box.height) &&
      box.width > 0 &&
      box.height > 0
    );
  }
}

// Export singleton instance
export const coordinateConverterService = new CoordinateConverterService();
