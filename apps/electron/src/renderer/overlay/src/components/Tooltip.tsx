import { useEffect, useRef, useState } from "react";
import { preventEdgeClipping } from "../utils/edgeClipping";

interface TooltipProps {
  x: number;
  y: number;
  stepNumber: number;
  instruction: string;
  color?: string;
}

export function Tooltip({
  x,
  y,
  stepNumber,
  instruction,
  color = "#3B82F6",
}: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (tooltipRef.current) {
      const { offsetWidth, offsetHeight } = tooltipRef.current;
      const adjustedPosition = preventEdgeClipping(
        { x, y },
        offsetWidth,
        offsetHeight
      );
      setPosition(adjustedPosition);
    }
  }, [x, y]);

  return (
    <div
      ref={tooltipRef}
      className="absolute text-white px-4 py-3 rounded-lg shadow-2xl max-w-[200px] pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: color,
      }}
    >
      <div className="text-xs font-bold uppercase tracking-wide opacity-80 mb-1">
        Step {stepNumber}
      </div>
      <div className="text-sm font-medium leading-snug">{instruction}</div>
    </div>
  );
}
