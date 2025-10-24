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
