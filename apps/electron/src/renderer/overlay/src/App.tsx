import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { HighlightOverlay } from "./components/HighlightOverlay";
import { GuideData } from "./types";
import { DisplayMetadata } from "./utils/multiMonitor";

declare global {
  interface Window {
    overlayAPI: {
      onHighlightUpdate: (callback: (data: GuideData) => void) => void;
      show: () => void;
      hide: () => void;
      getDisplayMetadata: () => Promise<DisplayMetadata[]>;
    };
  }
}

function App() {
  const [guideData, setGuideData] = useState<GuideData | null>(null);
  const [, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [, setDisplays] = useState<DisplayMetadata[]>([]);

  // Handle window resize for auto-adjustment
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      // Debounce resize handling (100ms)
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        console.log("[Overlay] Window resized:", {
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 100);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Fetch display metadata on mount
  useEffect(() => {
    const fetchDisplays = async () => {
      try {
        const displayData = await window.overlayAPI?.getDisplayMetadata();
        if (displayData) {
          setDisplays(displayData);
          console.log("[Overlay] Display metadata loaded:", displayData);
        }
      } catch (error) {
        console.error("[Overlay] Failed to fetch display metadata:", error);
      }
    };

    fetchDisplays();
  }, []);

  // Listen for guide data updates
  useEffect(() => {
    const handleHighlightUpdate = (data: GuideData) => {
      console.log("[Overlay] Received guide data:", {
        title: data.title,
        currentStep: data.currentStep,
        totalSteps: data.steps.length,
        hasTargetElement: !!data.steps[data.currentStep]?.targetElement,
      });
      setGuideData(data);
    };

    window.overlayAPI?.onHighlightUpdate(handleHighlightUpdate);
  }, []);

  if (!guideData) {
    return <div className="w-full h-full pointer-events-none" />;
  }

  const currentStep = guideData.steps[guideData.currentStep];

  if (!currentStep?.targetElement) {
    return <div className="w-full h-full pointer-events-none" />;
  }

  return (
    <div className="w-full h-full pointer-events-none">
      <AnimatePresence mode="wait">
        <HighlightOverlay key={currentStep.id} step={currentStep} />
      </AnimatePresence>
    </div>
  );
}

export default App;
