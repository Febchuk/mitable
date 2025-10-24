export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuideStep {
  id: string;
  stepNumber: number;
  instruction: string;
  targetElement?: {
    label: string;
    boundingBox: BoundingBox;
  };
  completed: boolean;
}

export interface GuideData {
  id: string;
  title: string;
  description: string;
  steps: GuideStep[];
  currentStep: number;
  completed: boolean;
}

export type HighlightType = "arrow" | "box" | "circle" | "tooltip";
export type AnimationType = "pulse" | "fade" | "none";
export type ArrowPosition = "top" | "right" | "bottom" | "left";

export interface Highlight {
  id: string;
  type: HighlightType;
  boundingBox: BoundingBox;
  label?: string;
  color?: string; // Default: #3B82F6
  animation?: AnimationType;
}
