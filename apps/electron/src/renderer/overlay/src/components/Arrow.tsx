import { BoundingBox } from "../types";

interface ArrowProps {
  boundingBox: BoundingBox;
  position: "top" | "right" | "bottom" | "left";
  color?: string;
}

/**
 * Calculate arrow start and end points for SVG path
 */
function getArrowPath(
  bbox: BoundingBox,
  position: "top" | "right" | "bottom" | "left"
): { path: string; instructionBox: { x: number; y: number } } {
  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;

  const arrowLength = 120;
  const curveAmount = 40;

  let startX: number, startY: number, endX: number, endY: number;
  let instructionX: number, instructionY: number;

  switch (position) {
    case "top":
      // Arrow points from top to element
      endX = centerX;
      endY = bbox.y;
      startX = centerX + curveAmount;
      startY = bbox.y - arrowLength;
      instructionX = startX - 100;
      instructionY = startY - 20;
      break;

    case "right":
      // Arrow points from right to element
      endX = bbox.x + bbox.width;
      endY = centerY;
      startX = bbox.x + bbox.width + arrowLength;
      startY = centerY - curveAmount;
      instructionX = startX + 10;
      instructionY = startY - 60;
      break;

    case "bottom":
      // Arrow points from bottom to element
      endX = centerX;
      endY = bbox.y + bbox.height;
      startX = centerX - curveAmount;
      startY = bbox.y + bbox.height + arrowLength;
      instructionX = startX - 100;
      instructionY = startY + 10;
      break;

    case "left":
    default:
      // Arrow points from left to element
      endX = bbox.x;
      endY = centerY;
      startX = bbox.x - arrowLength;
      startY = centerY + curveAmount;
      instructionX = startX - 210;
      instructionY = startY - 60;
      break;
  }

  // Create curved path using quadratic bezier
  const controlX = (startX + endX) / 2;
  const controlY = (startY + endY) / 2;
  const path = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;

  return {
    path,
    instructionBox: { x: instructionX, y: instructionY },
  };
}

export function Arrow({ boundingBox, position, color = "#3B82F6" }: ArrowProps) {
  const { path } = getArrowPath(boundingBox, position);

  return (
    <>
      <defs>
        {/* Arrow marker */}
        <marker
          id={`arrowhead-${color.replace("#", "")}`}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={color} />
        </marker>

        {/* Glow filter */}
        <filter id={`glow-${color.replace("#", "")}`}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Curved arrow path */}
      <path
        d={path}
        stroke={color}
        strokeWidth="3"
        fill="none"
        markerEnd={`url(#arrowhead-${color.replace("#", "")})`}
        filter={`url(#glow-${color.replace("#", "")})`}
        className="animate-pulse"
      />
    </>
  );
}

export function getInstructionBoxPosition(
  boundingBox: BoundingBox,
  position: "top" | "right" | "bottom" | "left"
): { x: number; y: number } {
  return getArrowPath(boundingBox, position).instructionBox;
}
