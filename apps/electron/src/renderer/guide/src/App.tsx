import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface GuideData {
  id: string;
  title: string;
  description: string;
  steps: Array<{
    id: string;
    stepNumber: number;
    instruction: string;
    completed: boolean;
  }>;
  currentStep: number;
  completed: boolean;
}

declare global {
  interface Window {
    guideAPI: {
      onGuideData: (callback: (data: GuideData) => void) => void;
      nextStep: () => void;
      updateStep: (data: GuideData) => void;
      complete: () => void;
      cancel: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
    };
  }
}

function App() {
  const [guideData, setGuideData] = useState<GuideData | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    window.guideAPI?.onGuideData((data: GuideData) => {
      setGuideData(data);
      setCurrentStepIndex(data.currentStep);
    });
  }, []);

  const handleMouseEnter = () => {
    window.guideAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.guideAPI?.setIgnoreMouseEvents(true);
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      const newStepIndex = currentStepIndex - 1;
      setCurrentStepIndex(newStepIndex);

      // Notify overlay of step change
      if (guideData) {
        const updatedGuideData = {
          ...guideData,
          currentStep: newStepIndex,
        };
        window.guideAPI?.updateStep(updatedGuideData);
      }
    }
  };

  const handleNext = () => {
    if (guideData && currentStepIndex < guideData.steps.length - 1) {
      const newStepIndex = currentStepIndex + 1;
      setCurrentStepIndex(newStepIndex);

      // Notify overlay of step change
      const updatedGuideData = {
        ...guideData,
        currentStep: newStepIndex,
      };
      window.guideAPI?.updateStep(updatedGuideData);
    }
  };

  if (!guideData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#2A2A2A] rounded-2xl p-4 text-text-secondary">
        Waiting for guide data...
      </div>
    );
  }

  const currentStep = guideData.steps[currentStepIndex];
  const totalSteps = guideData.steps.length;

  return (
    <div
      className="w-full h-full flex items-center justify-center p-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="w-full bg-[#2A2A2A] rounded-2xl p-6 flex flex-col gap-6">
        {/* Title */}
        <h2 className="text-text-tertiary text-sm">{guideData.title}</h2>

        {/* Current Step Card */}
        <div className="bg-[#3A3A3A] rounded-xl p-6 min-h-[200px] flex items-center justify-center">
          <p className="text-white text-xl text-center leading-relaxed">
            {currentStep.instruction}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handlePrevious}
            disabled={currentStepIndex === 0}
            className="w-12 h-12 bg-[#3A3A3A] hover:bg-[#4A4A4A] disabled:opacity-30 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            aria-label="Previous step"
          >
            <ChevronLeft size={24} className="text-white" />
          </button>

          <span className="text-white text-sm font-medium min-w-[60px] text-center">
            {currentStepIndex + 1} of {totalSteps}
          </span>

          <button
            onClick={handleNext}
            disabled={currentStepIndex === totalSteps - 1}
            className="w-12 h-12 bg-[#3A3A3A] hover:bg-[#4A4A4A] disabled:opacity-30 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            aria-label="Next step"
          >
            <ChevronRight size={24} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
