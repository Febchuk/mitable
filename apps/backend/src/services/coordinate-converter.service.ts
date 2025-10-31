/**
 * Coordinate Converter Service
 *
 * Converts bounding box coordinates between normalized (0-1) and pixel formats.
 * Based on the working implementation from ui-element-detection-experiment.
 *
 * Normalized coordinates (0-1 range):
 * - x: 0.0 = left edge, 1.0 = right edge
 * - y: 0.0 = top edge, 1.0 = bottom edge
 * - width/height: fraction of total dimensions
 *
 * Pixel coordinates:
 * - Absolute pixel values based on image dimensions
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export class CoordinateConverterService {
  /**
   * Convert normalized coordinates (0-1) to pixel coordinates
   *
   * Auto-detects whether coordinates are normalized or already in pixels
   * based on value ranges (<=1 = normalized, >1 = pixels)
   *
   * @param boundingBox - Box with normalized or pixel coordinates
   * @param imageDimensions - Screenshot dimensions in pixels
   * @returns Box with pixel coordinates, validated and clamped to image bounds
   */
  convertToPixels(boundingBox: BoundingBox, imageDimensions: ImageDimensions): BoundingBox {
    const { width: imageWidth, height: imageHeight } = imageDimensions;

    let x: number, y: number, width: number, height: number;

    // Auto-detect coordinate system (normalized vs pixels)
    // Normalized: values are in 0-1 range
    // Pixels: values are > 1
    if (
      boundingBox.x <= 1 &&
      boundingBox.y <= 1 &&
      boundingBox.width <= 1 &&
      boundingBox.height <= 1
    ) {
      // Coordinates are normalized (0-1) - convert to pixels
      x = boundingBox.x * imageWidth;
      y = boundingBox.y * imageHeight;
      width = boundingBox.width * imageWidth;
      height = boundingBox.height * imageHeight;

      console.log("[CoordinateConverter] Converted normalized to pixels:", {
        input: boundingBox,
        output: { x, y, width, height },
        imageDimensions,
      });
    } else {
      // Already in pixels - use as-is
      x = boundingBox.x;
      y = boundingBox.y;
      width = boundingBox.width;
      height = boundingBox.height;

      console.log("[CoordinateConverter] Coordinates already in pixels:", {
        input: boundingBox,
        imageDimensions,
      });
    }

    // Validate and clamp to image bounds
    // Ensure coordinates don't go outside the image
    x = Math.max(0, Math.min(x, imageWidth));
    y = Math.max(0, Math.min(y, imageHeight));
    width = Math.min(width, imageWidth - x);
    height = Math.min(height, imageHeight - y);

    // Warn if box is too small (likely invalid detection)
    if (width <= 0 || height <= 0) {
      console.warn("[CoordinateConverter] Invalid box dimensions after clamping:", {
        x,
        y,
        width,
        height,
        originalBox: boundingBox,
        imageDimensions,
      });
    }

    return { x, y, width, height };
  }

  /**
   * Convert array of bounding boxes from normalized to pixels
   *
   * @param boundingBoxes - Array of boxes with normalized or pixel coordinates
   * @param imageDimensions - Screenshot dimensions in pixels
   * @returns Array of boxes with pixel coordinates
   */
  convertMultipleToPixels(
    boundingBoxes: BoundingBox[],
    imageDimensions: ImageDimensions
  ): BoundingBox[] {
    return boundingBoxes.map((box) => this.convertToPixels(box, imageDimensions));
  }

  /**
   * Validate if coordinates are within image bounds
   *
   * @param boundingBox - Box to validate (should be in pixels)
   * @param imageDimensions - Screenshot dimensions in pixels
   * @returns true if box is valid and within bounds, false otherwise
   */
  validateBounds(boundingBox: BoundingBox, imageDimensions: ImageDimensions): boolean {
    const { x, y, width, height } = boundingBox;
    const { width: imageWidth, height: imageHeight } = imageDimensions;

    const isValid =
      x >= 0 &&
      y >= 0 &&
      x + width <= imageWidth &&
      y + height <= imageHeight &&
      width > 0 &&
      height > 0;

    if (!isValid) {
      console.warn("[CoordinateConverter] Bounding box validation failed:", {
        boundingBox,
        imageDimensions,
        validationChecks: {
          xValid: x >= 0,
          yValid: y >= 0,
          widthValid: x + width <= imageWidth,
          heightValid: y + height <= imageHeight,
          widthPositive: width > 0,
          heightPositive: height > 0,
        },
      });
    }

    return isValid;
  }

  /**
   * Convert pixels to normalized coordinates (0-1 range)
   * Useful for testing or when sending coordinates back to AI models
   *
   * @param boundingBox - Box with pixel coordinates
   * @param imageDimensions - Screenshot dimensions in pixels
   * @returns Box with normalized coordinates (0-1 range)
   */
  convertToNormalized(boundingBox: BoundingBox, imageDimensions: ImageDimensions): BoundingBox {
    const { width: imageWidth, height: imageHeight } = imageDimensions;

    return {
      x: boundingBox.x / imageWidth,
      y: boundingBox.y / imageHeight,
      width: boundingBox.width / imageWidth,
      height: boundingBox.height / imageHeight,
    };
  }
}

// Export singleton instance
export const coordinateConverter = new CoordinateConverterService();
