import { useState, useEffect } from "react";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GuideStep {
  id: string;
  stepNumber: number;
  instruction: string;
  targetElement?: {
    label: string;
    boundingBox: BoundingBox;
  };
  completed: boolean;
}

interface GuideData {
  id: string;
  title: string;
  description: string;
  steps: GuideStep[];
  currentStep: number;
  completed: boolean;
}

declare global {
  interface Window {
    overlayAPI: {
      onHighlightUpdate: (callback: (data: GuideData) => void) => void;
      show: () => void;
      hide: () => void;
    };
  }
}

type ArrowPosition = "top" | "right" | "bottom" | "left";

/**
 * Determine optimal arrow position based on element location on screen
 */
function getArrowPosition(bbox: BoundingBox): ArrowPosition {
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

/**
 * Calculate arrow start and end points for SVG path
 */
function getArrowPath(
  bbox: BoundingBox,
  position: ArrowPosition
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

function App() {
  const [guideData, setGuideData] = useState<GuideData | null>(null);

  useEffect(() => {
    window.overlayAPI?.onHighlightUpdate((data: GuideData) => {
      console.log("[Overlay] Received guide data:", {
        title: data.title,
        currentStep: data.currentStep,
        hasTargetElement: !!data.steps[data.currentStep]?.targetElement,
      });
      setGuideData(data);
    });
  }, []);

  if (!guideData) {
    return <div className="w-full h-full pointer-events-none" />;
  }

  const currentStep = guideData.steps[guideData.currentStep];
  const targetElement = currentStep?.targetElement;

  if (!targetElement) {
    return <div className="w-full h-full pointer-events-none" />;
  }

  const { x, y, width, height } = targetElement.boundingBox;
  const arrowPosition = getArrowPosition(targetElement.boundingBox);
  const { path, instructionBox } = getArrowPath(targetElement.boundingBox, arrowPosition);

  return (
    <div className="w-full h-full pointer-events-none">
      {/* SVG Canvas for Arrow */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          {/* Arrow marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#3B82F6" />
          </marker>

          {/* Glow filter */}
          <filter id="glow">
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
          stroke="#3B82F6"
          strokeWidth="3"
          fill="none"
          markerEnd="url(#arrowhead)"
          filter="url(#glow)"
          className="animate-pulse"
        />
      </svg>

      {/* Highlight Box around target element */}
      <div
        className="absolute border-4 border-primary rounded-lg"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          boxShadow: "0 0 30px rgba(59, 130, 246, 0.6)",
          animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        }}
      />

      {/* Instruction card at arrow start */}
      <div
        className="absolute bg-primary text-white px-4 py-3 rounded-lg shadow-2xl max-w-[200px]"
        style={{
          left: `${instructionBox.x}px`,
          top: `${instructionBox.y}px`,
        }}
      >
        <div className="text-xs font-bold uppercase tracking-wide opacity-80 mb-1">
          Step {currentStep.stepNumber}
        </div>
        <div className="text-sm font-medium leading-snug">
          {currentStep.instruction}
        </div>
      </div>
    </div>
  );
}

export default App;
