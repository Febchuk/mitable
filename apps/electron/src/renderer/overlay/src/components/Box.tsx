import { BoundingBox } from "../types";

interface BoxProps {
  boundingBox: BoundingBox;
  color?: string;
  animation?: "pulse" | "fade" | "none";
  screenDimensions?: { width: number; height: number }; // Optional for validation
}

export function Box({
  boundingBox,
  color = "#3B82F6",
  animation = "pulse",
  screenDimensions
}: BoxProps) {
  let { x, y, width, height } = boundingBox;

  // Validate and clamp coordinates if screen dimensions provided
  if (screenDimensions) {
    const originalBox = { x, y, width, height };

    // Clamp position to screen bounds
    x = Math.max(0, Math.min(x, screenDimensions.width - width));
    y = Math.max(0, Math.min(y, screenDimensions.height - height));

    // Clamp size to not exceed screen bounds
    width = Math.min(width, screenDimensions.width - x);
    height = Math.min(height, screenDimensions.height - y);

    // Log warning if coordinates were clamped
    if (
      originalBox.x !== x ||
      originalBox.y !== y ||
      originalBox.width !== width ||
      originalBox.height !== height
    ) {
      console.warn("[Box] Coordinates clamped to screen bounds:", {
        original: originalBox,
        clamped: { x, y, width, height },
        screenDimensions,
      });
    }

    // Ensure dimensions are positive
    if (width <= 0 || height <= 0) {
      console.error("[Box] Invalid box dimensions after clamping:", {
        x,
        y,
        width,
        height,
        screenDimensions,
      });
      // Don't render invalid boxes
      return null;
    }
  }

  const animationClass =
    animation === "pulse" ? "animate-pulse" : animation === "fade" ? "animate-fade-in" : "";

  return (
    <div
      className={`absolute border-4 rounded-lg pointer-events-none ${animationClass}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
        borderColor: color,
        boxShadow: `0 0 30px ${color}99`, // 99 = 60% opacity in hex
      }}
    />
  );
}
