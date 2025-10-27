import { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { Step } from "@mitable/shared";

interface GuideDisplayData {
  conversationId: string;
  stepList: Step[];
  currentStepIndex: number;
}

declare global {
  interface Window {
    guideAPI: {
      onGuideData: (callback: (data: GuideDisplayData) => void) => void;
      nextStep: (data: { conversationId: string; currentStepIndex: number }) => void;
      onStepUpdate: (callback: (data: any) => void) => void;
      updateStep: (data: unknown) => void;
      complete: () => void;
      cancel: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
    };
  }
}

function App() {
  const [guideData, setGuideData] = useState<GuideDisplayData | null>(null);
  const [showCompletedSteps, setShowCompletedSteps] = useState(true);
  const currentStepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.guideAPI?.onGuideData((data: GuideDisplayData) => {
      console.log("[Guide] Received guide data:", {
        conversationId: data.conversationId,
        stepsCount: data.stepList.length,
        currentStepIndex: data.currentStepIndex,
      });
      setGuideData(data);
    });

    window.guideAPI?.onStepUpdate((updateData: any) => {
      console.log("[Guide] Received step update:", updateData);
      if (updateData.adjustedSolution) {
        setGuideData((prev) => ({
          conversationId: prev?.conversationId || "",
          stepList: updateData.adjustedSolution.stepList,
          currentStepIndex: updateData.adjustedSolution.currentStepIndex,
        }));
      }
    });
  }, []);

  useEffect(() => {
    if (currentStepRef.current) {
      currentStepRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [guideData?.currentStepIndex]);

  const handleMouseEnter = () => {
    window.guideAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.guideAPI?.setIgnoreMouseEvents(true);
  };

  const toggleCompletedSteps = () => {
    setShowCompletedSteps((prev) => !prev);
  };

  if (!guideData) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#2A2A2A] rounded-2xl p-4 text-text-secondary">
        Waiting for guide data...
      </div>
    );
  }

  const completedSteps = guideData.stepList.filter((step) => step.status === "completed");
  const currentStep = guideData.stepList.find((step) => step.status === "current");
  const pendingSteps = guideData.stepList.filter((step) => step.status === "pending");

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
            Step-by-Step Guide
          </h2>
          <p className="text-text-secondary text-xs mt-1">
            {guideData.stepList.length} steps total
          </p>
        </div>

        {/* Step List - Scrollable */}
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
                      key={step.stepNumber}
                      className="bg-[#3A3A3A] rounded-lg p-4 flex gap-3 opacity-60"
                    >
                      <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-text-tertiary text-xs font-medium">
                          Step {step.stepNumber}
                        </div>
                        <div className="text-white text-sm line-through">{step.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current Step - Highlighted */}
          {currentStep && (
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
                <p className="text-white text-lg leading-relaxed pl-8">{currentStep.description}</p>
              </div>
            </div>
          )}

          {/* Pending Steps */}
          {pendingSteps.length > 0 && (
            <div className="space-y-2">
              <div className="text-text-secondary text-xs font-medium px-2 py-1">
                Upcoming ({pendingSteps.length})
              </div>
              {pendingSteps.map((step) => (
                <div
                  key={step.stepNumber}
                  className="bg-[#3A3A3A] rounded-lg p-4 flex gap-3 opacity-40"
                >
                  <div className="flex-shrink-0 w-6 h-6 bg-[#5A5A5A] rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">{step.stepNumber}</span>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="text-text-tertiary text-xs font-medium">
                      Step {step.stepNumber}
                    </div>
                    <div className="text-white text-sm">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All steps completed */}
          {guideData.stepList.length > 0 && guideData.stepList.every((step) => step.status === "completed") && (
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
        {guideData.stepList.length > 0 && (
          <div className="flex-shrink-0 space-y-3">
            {/* Progress Text */}
            <div className="text-center">
              <p className="text-text-tertiary text-xs">
                {completedSteps.length > 0 && (
                  <span className="text-green-500 font-medium">
                    {completedSteps.length} completed
                  </span>
                )}
                {completedSteps.length > 0 && currentStep && (
                  <span className="text-text-tertiary"> • </span>
                )}
                {currentStep && (
                  <span className="text-text-secondary">
                    Step {currentStep.stepNumber} of {guideData.stepList.length}
                  </span>
                )}
              </p>
            </div>

            {/* Done Button - Only show when current step is active */}
            {currentStep && (
              <button
                onClick={() =>
                  window.guideAPI?.nextStep({
                    conversationId: guideData.conversationId,
                    currentStepIndex: guideData.currentStepIndex,
                  })
                }
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
