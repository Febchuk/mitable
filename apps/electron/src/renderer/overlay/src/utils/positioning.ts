import { BoundingBox, ArrowPosition } from "../types";

/**
 * Determine optimal arrow position based on element location on screen
 */
export function getArrowPosition(bbox: BoundingBox): ArrowPosition {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const elementCenterX = bbox.x + bbox.width / 2;
  const elementCenterY = bbox.y + bbox.height / 2;

  const fromLeft = elementCenterX;
  const fromRight = screenWidth - elementCenterX;
  const fromTop = elementCenterY;
  const fromBottom = screenHeight - elementCenterY;

  // Find which edge has the most space
  const distances = {
    left: fromLeft,
    right: fromRight,
    top: fromTop,
    bottom: fromBottom,
  };

  // Return the position with maximum space for the arrow
  const maxDistance = Math.max(...Object.values(distances));
  if (distances.top === maxDistance && fromTop > 150) return "top";
  if (distances.right === maxDistance && fromRight > 150) return "right";
  if (distances.bottom === maxDistance && fromBottom > 150) return "bottom";
  if (distances.left === maxDistance && fromLeft > 150) return "left";

  // Default to top if no clear winner
  return "top";
}
