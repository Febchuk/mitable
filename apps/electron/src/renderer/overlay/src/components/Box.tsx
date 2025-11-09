import { useEffect } from "react";
import { BoundingBox } from "../types";

interface BoxProps {
  boundingBox: BoundingBox;
  color?: string;
  animation?: "pulse" | "fade" | "none";
}

export function Box({ boundingBox, color = "#3B82F6", animation = "pulse" }: BoxProps) {
  const { x, y, width, height } = boundingBox;

  const animationClass =
    animation === "pulse" ? "animate-pulse" : animation === "fade" ? "animate-fade-in" : "";

  // Debug warning for oversized bounding boxes
  useEffect(() => {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const widthPercent = (width / screenWidth) * 100;
    const heightPercent = (height / screenHeight) * 100;

    // Warn if bounding box is suspiciously large (>40% screen coverage)
    if (widthPercent > 40 || heightPercent > 40) {
      console.warn("[Overlay Box] Large bounding box detected:", {
        position: { x, y },
        size: { width, height },
        screenSize: { screenWidth, screenHeight },
        coverage: {
          widthPercent: widthPercent.toFixed(1) + "%",
          heightPercent: heightPercent.toFixed(1) + "%",
        },
        message:
          "This bounding box may be too large. Expected: buttons/links (5-25% width, 2-10% height)",
      });
    }
  }, [x, y, width, height]);

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
