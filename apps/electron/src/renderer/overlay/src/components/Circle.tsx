import { BoundingBox } from "../types";

interface CircleProps {
  boundingBox: BoundingBox;
  color?: string;
  animation?: "pulse" | "fade" | "none";
}

export function Circle({ boundingBox, color = "#3B82F6", animation = "pulse" }: CircleProps) {
  const { x, y, width, height } = boundingBox;

  // Calculate center and radius to fit the bounding box
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = Math.max(width, height) / 2;

  const animationClass =
    animation === "pulse" ? "animate-pulse" : animation === "fade" ? "animate-fade-in" : "";

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      <defs>
        <filter id={`circle-glow-${color.replace("#", "")}`}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        filter={`url(#circle-glow-${color.replace("#", "")})`}
        className={animationClass}
      />
    </svg>
  );
}
