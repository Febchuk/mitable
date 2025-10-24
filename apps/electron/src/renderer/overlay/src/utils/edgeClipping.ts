/**
 * Prevent tooltip from clipping off screen edges
 */
export function preventEdgeClipping(
  position: { x: number; y: number },
  tooltipWidth: number,
  tooltipHeight: number
): { x: number; y: number } {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const padding = 10; // Minimum distance from screen edges

  let { x, y } = position;

  // Prevent right edge clipping
  if (x + tooltipWidth > screenWidth - padding) {
    x = screenWidth - tooltipWidth - padding;
  }

  // Prevent left edge clipping
  if (x < padding) {
    x = padding;
  }

  // Prevent bottom edge clipping
  if (y + tooltipHeight > screenHeight - padding) {
    y = screenHeight - tooltipHeight - padding;
  }

  // Prevent top edge clipping
  if (y < padding) {
    y = padding;
  }

  return { x, y };
}
