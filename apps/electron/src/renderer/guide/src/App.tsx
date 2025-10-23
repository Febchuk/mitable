import { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

interface GuideStep {
  id: string;
  stepNumber: number;
  instruction: string;
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
  const [stepHistory, setStepHistory] = useState<GuideStep[]>([]);
  const [showCompletedSteps, setShowCompletedSteps] = useState(true);
  const currentStepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.guideAPI?.onGuideData((data: GuideData) => {
      console.log("[Guide] Received guide data:", {
        title: data.title,
        stepsCount: data.steps.length,
        currentStep: data.currentStep,
      });

      // For iterative mode: accumulate steps as they arrive
      if (data.steps.length === 1) {
        // New step arrived - add to history
        const newStep = data.steps[0];
        setStepHistory((prev) => {
          // Mark previous step as completed if it exists
          const updatedHistory = prev.map((step, idx) =>
            idx === prev.length - 1 ? { ...step, completed: true } : step
          );
          // Add new step
          return [...updatedHistory, newStep];
        });
      } else {
        // Complete guide data received (legacy mode)
        setStepHistory(data.steps);
      }

      setGuideData(data);
    });
  }, []);

  // Auto-scroll to current step when it changes
  useEffect(() => {
    if (currentStepRef.current) {
      currentStepRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [stepHistory.length]);

  const handleMouseEnter = () => {
    window.guideAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.guideAPI?.setIgnoreMouseEvents(true);
  };

  const toggleCompletedSteps = () => {
    setShowCompletedSteps((prev) => !prev);
  };

  if (!guideData && stepHistory.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#2A2A2A] rounded-2xl p-4 text-text-secondary">
        Waiting for guide data...
      </div>
    );
  }

  const completedSteps = stepHistory.filter((step) => step.completed);
  const currentStep = stepHistory[stepHistory.length - 1];

  return (
    <div
      className="w-full h-full flex items-center justify-center p-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="w-full bg-[#2A2A2A] rounded-2xl p-6 flex flex-col gap-4 h-full overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0">
          <h2 className="text-text-tertiary text-sm font-medium">
            {guideData?.title || "Step-by-Step Guide"}
          </h2>
        </div>

        {/* Step History - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
          {/* Completed Steps - Collapsible */}
          {completedSteps.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={toggleCompletedSteps}
                className="w-full flex items-center justify-between text-text-secondary hover:text-text-primary transition-colors text-sm px-2 py-1 rounded-lg hover:bg-[#3A3A3A]"
              >
                <span className="font-medium">Completed ({completedSteps.length})</span>
                {showCompletedSteps ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showCompletedSteps && (
                <div className="space-y-2">
                  {completedSteps.map((step) => (
                    <div
                      key={step.id}
                      className="bg-[#3A3A3A] rounded-lg p-4 flex gap-3 opacity-60"
                    >
                      {/* Checkmark */}
                      <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-1">
                        <div className="text-text-tertiary text-xs font-medium">
                          Step {step.stepNumber}
                        </div>
                        <div className="text-white text-sm line-through">{step.instruction}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current Step - Highlighted */}
          {currentStep && !currentStep.completed && (
            <div
              ref={currentStepRef}
              className="bg-primary/10 rounded-lg p-4 border-2 border-primary"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{currentStep.stepNumber}</span>
                  </div>
                  <span className="text-primary text-xs font-bold uppercase tracking-wide">
                    Current Step
                  </span>
                </div>
                <p className="text-white text-lg leading-relaxed pl-8">{currentStep.instruction}</p>
              </div>
            </div>
          )}

          {/* All steps completed */}
          {stepHistory.length > 0 && stepHistory.every((step) => step.completed) && (
            <div className="bg-green-500/10 rounded-lg p-6 border-2 border-green-500 text-center">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-white" />
              </div>
              <p className="text-green-500 text-lg font-bold">All Done!</p>
              <p className="text-text-secondary text-sm mt-2">You've completed all steps</p>
            </div>
          )}
        </div>

        {/* Footer - Progress Indicator + Done Button */}
        {stepHistory.length > 0 && (
          <div className="flex-shrink-0 space-y-3">
            {/* Progress Text */}
            <div className="text-center">
              <p className="text-text-tertiary text-xs">
                {completedSteps.length > 0 && (
                  <span className="text-green-500 font-medium">
                    {completedSteps.length} completed
                  </span>
                )}
                {completedSteps.length > 0 && !currentStep?.completed && (
                  <span className="text-text-tertiary"> • </span>
                )}
                {!currentStep?.completed && (
                  <span className="text-text-secondary">
                    Step {currentStep?.stepNumber || stepHistory.length}
                  </span>
                )}
              </p>
            </div>

            {/* Done Button - Only show when current step is active */}
            {currentStep && !currentStep.completed && (
              <button
                onClick={() => window.guideAPI?.nextStep()}
                className="w-full bg-primary hover:bg-primary-hover text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Done - Next Step
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
