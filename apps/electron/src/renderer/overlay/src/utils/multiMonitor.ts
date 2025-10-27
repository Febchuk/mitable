import { BoundingBox } from "../types";

export interface DisplayMetadata {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
}

/**
 * Adjust bounding box coordinates for display offset
 * This translates absolute screen coordinates to overlay window coordinates
 */
export function adjustForDisplay(
  bbox: BoundingBox,
  displayMetadata: DisplayMetadata
): BoundingBox {
  const { bounds, scaleFactor } = displayMetadata;

  return {
    x: (bbox.x - bounds.x) * scaleFactor,
    y: (bbox.y - bounds.y) * scaleFactor,
    width: bbox.width * scaleFactor,
    height: bbox.height * scaleFactor,
  };
}

/**
 * Determine which display a bounding box is on
 */
export function findTargetDisplay(
  bbox: BoundingBox,
  displays: DisplayMetadata[]
): DisplayMetadata | null {
  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;

  for (const display of displays) {
    const { bounds } = display;
    if (
      centerX >= bounds.x &&
      centerX < bounds.x + bounds.width &&
      centerY >= bounds.y &&
      centerY < bounds.y + bounds.height
    ) {
      return display;
    }
  }

  // Default to primary display (first in array)
  return displays[0] || null;
}
