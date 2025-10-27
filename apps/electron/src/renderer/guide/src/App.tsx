import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

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
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    window.guideAPI?.onGuideData((data: GuideData) => {
      console.log("[Guide] Received guide data:", {
        title: data.title,
        stepsCount: data.steps.length,
        currentStep: data.currentStep,
      });

      // For iterative mode: accumulate steps as they arrive
      if (data.steps.length === 1) {
        const newStep = data.steps[0];
        setStepHistory((prev) => {
          const updatedHistory = prev.map((step, idx) =>
            idx === prev.length - 1 ? { ...step, completed: true } : step
          );
          return [...updatedHistory, newStep];
        });
        // Auto-advance to the newly received step
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        // All steps received at once (legacy mode)
        setStepHistory(data.steps);
        setCurrentStepIndex(0);
      }

      setGuideData(data);
    });
  }, []);

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleNextStep = () => {
    // Navigate to next step locally (don't send message to backend)
    if (currentStepIndex < stepHistory.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else if (currentStepIndex === stepHistory.length - 1) {
      // On last step, mark workflow as complete
      window.guideAPI?.complete();
    }
  };

  const currentStep = stepHistory[currentStepIndex];
  const totalSteps = stepHistory.length;
  const isLastStep = currentStepIndex === stepHistory.length - 1;
  const isFirstStep = currentStepIndex === 0;

  if (!guideData && stepHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-transparent">
        <div className="w-[700px] rounded-2xl bg-[#2C2C2C] text-white overflow-hidden shadow-lg p-8">
          <div className="text-center text-gray-400 text-lg">Waiting for guide data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-transparent">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStepIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="w-[700px] rounded-2xl bg-[#2C2C2C] text-white overflow-hidden shadow-lg app-drag"
        >
          {/* Prompt Section */}
          <div className="p-8 text-center text-2xl font-medium app-drag">
            {currentStep?.instruction || "Loading..."}
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
              {currentStepIndex + 1} of {totalSteps}
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
