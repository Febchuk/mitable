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

function App() {
  const [guideData, setGuideData] = useState<GuideData | null>(null);

  useEffect(() => {
    window.overlayAPI?.onHighlightUpdate((data: GuideData) => {
      console.log("Overlay received guide data:", data);
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

  return (
    <div className="w-full h-full pointer-events-none">
      {/* Highlight Box */}
      <div
        className="absolute border-4 border-primary rounded-lg animate-pulse"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
        }}
      />

      {/* Label */}
      <div
        className="absolute bg-primary text-white px-3 py-1 rounded-md text-sm font-medium"
        style={{
          left: `${x}px`,
          top: `${y - 40}px`,
        }}
      >
        {targetElement.label}
      </div>
    </div>
  );
}

export default App;
