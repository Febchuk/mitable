import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
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

  useEffect(() => {
    window.guideAPI?.onGuideData((data: GuideDisplayData) => {
      // Defensive check: Ensure we have required data
      if (!data?.conversationId) {
        console.error("[Guide] Missing conversationId in guide data:", data);
        return;
      }

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

  const handlePrevStep = () => {
    if (guideData && guideData.currentStepIndex > 0) {
      // Move to previous step
      window.guideAPI?.nextStep({
        conversationId: guideData.conversationId,
        currentStepIndex: guideData.currentStepIndex - 1,
      });
    }
  };

  const handleNextStep = () => {
    if (guideData) {
      const currentStepNumber = guideData.currentStepIndex + 1; // 1-based
      const totalSteps = guideData.stepList.length;
      const isLastStep = currentStepNumber === totalSteps;

      if (isLastStep) {
        // Complete guide and dismiss window
        window.guideAPI?.complete();
      } else {
        // Progress to next step
        window.guideAPI?.nextStep({
          conversationId: guideData.conversationId,
          currentStepIndex: guideData.currentStepIndex,
        });
      }
    }
  };

  if (!guideData) {
    return (
      <div className="flex items-center justify-center h-full bg-transparent">
        <div className="w-[700px] rounded-2xl bg-[#2C2C2C] text-white overflow-hidden shadow-lg p-8 app-drag">
          <div className="text-center text-gray-400 text-lg">Waiting for guide data...</div>
        </div>
      </div>
    );
  }

  const currentStep = guideData.stepList[guideData.currentStepIndex];
  const totalSteps = guideData.stepList.length;
  const currentStepNumber = guideData.currentStepIndex + 1; // 1-based for display
  const isLastStep = currentStepNumber === totalSteps;
  const isFirstStep = currentStepNumber === 1;

  return (
    <div className="flex items-center justify-center h-full bg-transparent">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStepNumber}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="w-[700px] rounded-2xl bg-[#2C2C2C] text-white overflow-hidden shadow-lg app-drag"
        >
          {/* Prompt Section */}
          <div className="p-8 text-center text-2xl font-medium app-drag">
            {currentStep?.description || "Loading..."}
          </div>

          {/* Footer Section */}
          <div className="flex items-center justify-between bg-[#1A1A1A] p-6 app-drag">
            <button
              onClick={handlePrevStep}
              disabled={isFirstStep}
              className="flex items-center justify-center w-12 h-12 bg-[#2F2F2F] rounded-full hover:bg-[#3A3A3A] transition disabled:opacity-30 disabled:cursor-not-allowed app-no-drag"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="text-gray-400 text-lg">
              {currentStepNumber} of {totalSteps}
            </div>

            {isLastStep ? (
              <button
                onClick={handleNextStep}
                className="flex items-center justify-center w-12 h-12 bg-green-500 rounded-full hover:bg-green-600 transition app-no-drag"
              >
                <Check size={24} />
              </button>
            ) : (
              <button
                onClick={handleNextStep}
                className="flex items-center justify-center w-12 h-12 bg-[#2F2F2F] rounded-full hover:bg-[#3A3A3A] transition app-no-drag"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default App;
