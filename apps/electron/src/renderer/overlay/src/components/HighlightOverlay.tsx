import { motion } from "framer-motion";
import { Arrow, getInstructionBoxPosition } from "./Arrow";
import { Box } from "./Box";
import { Circle } from "./Circle";
import { Tooltip } from "./Tooltip";
import { BoundingBox, GuideStep } from "../types";
import { getArrowPosition } from "../utils/positioning";

interface HighlightOverlayProps {
  step: GuideStep;
}

export function HighlightOverlay({ step }: HighlightOverlayProps) {
  const targetElement = step.targetElement;

  if (!targetElement) {
    return null;
  }

  const { boundingBox, label } = targetElement;
  const arrowPosition = getArrowPosition(boundingBox);
  const instructionBoxPosition = getInstructionBoxPosition(boundingBox, arrowPosition);

  console.log("[HighlightOverlay] Rendering step:", {
    stepNumber: step.stepNumber,
    instruction: step.instruction,
    targetLabel: label,
    boundingBox: boundingBox,
  });

  return (
    <motion.div
      key={step.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pointer-events-none"
    >
      {/* SVG Canvas for Arrow */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <Arrow boundingBox={boundingBox} position={arrowPosition} />
      </svg>

      {/* Highlight box */}
      <Box boundingBox={boundingBox} />

      {/* Instruction tooltip */}
      <Tooltip
        x={instructionBoxPosition.x}
        y={instructionBoxPosition.y}
        stepNumber={step.stepNumber}
        instruction={step.instruction}
      />
    </motion.div>
  );
}

interface MultiHighlightOverlayProps {
  highlights: Array<{
    id: string;
    type: "arrow" | "box" | "circle";
    boundingBox: BoundingBox;
    label?: string;
    color?: string;
  }>;
}

/**
 * Renders multiple highlights simultaneously (up to 20+)
 */
export function MultiHighlightOverlay({ highlights }: MultiHighlightOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pointer-events-none"
    >
      {highlights.map((highlight) => {
        switch (highlight.type) {
          case "arrow": {
            const arrowPos = getArrowPosition(highlight.boundingBox);
            return (
              <svg
                key={highlight.id}
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <Arrow
                  boundingBox={highlight.boundingBox}
                  position={arrowPos}
                  color={highlight.color}
                />
              </svg>
            );
          }

          case "box":
            return (
              <Box key={highlight.id} boundingBox={highlight.boundingBox} color={highlight.color} />
            );

          case "circle":
            return (
              <Circle
                key={highlight.id}
                boundingBox={highlight.boundingBox}
                color={highlight.color}
              />
            );

          default:
            return null;
        }
      })}
    </motion.div>
  );
}
