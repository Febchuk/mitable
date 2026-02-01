/**
 * ScreenshotCarousel
 *
 * Screenshot viewer with navigation for the detail panel.
 */

import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Camera, Maximize2 } from "lucide-react";
import type { SessionCapture } from "@/console/src/services/monitoringService";
import { formatTime } from "./utils/formatDuration";

interface ScreenshotCarouselProps {
  captures: SessionCapture[];
  className?: string;
}

export default function ScreenshotCarousel({
  captures,
  className = "",
}: ScreenshotCarouselProps) {
  // Filter to captures that have image data
  const capturesWithImages = captures.filter((c) => c.imageData);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset index if captures change
  useEffect(() => {
    setCurrentIndex(0);
  }, [capturesWithImages.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) =>
      prev > 0 ? prev - 1 : capturesWithImages.length - 1
    );
  }, [capturesWithImages.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) =>
      prev < capturesWithImages.length - 1 ? prev + 1 : 0
    );
  }, [capturesWithImages.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        goToNext();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevious, goToNext, isFullscreen]);

  if (capturesWithImages.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-background-tertiary rounded-lg p-8 ${className}`}>
        <div className="text-center">
          <Camera className="w-12 h-12 text-text-tertiary mx-auto mb-2" />
          <p className="text-text-secondary text-sm">No screenshots available</p>
        </div>
      </div>
    );
  }

  const currentCapture = capturesWithImages[currentIndex];

  return (
    <>
      <div className={`relative group ${className}`}>
        {/* Main image container */}
        <div className="relative bg-background-tertiary rounded-lg overflow-hidden aspect-video">
          <img
            src={`data:image/png;base64,${currentCapture.imageData}`}
            alt={currentCapture.activityDescription || "Screenshot"}
            className="w-full h-full object-contain transition-opacity duration-200"
          />

          {/* Navigation arrows (show on hover) */}
          {capturesWithImages.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                aria-label="Next screenshot"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Fullscreen button */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            aria-label="View fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Caption */}
        <div className="mt-2 text-center">
          <div className="text-sm text-text-primary">
            Screenshot {currentIndex + 1} of {capturesWithImages.length}
          </div>
          <div className="text-xs text-text-tertiary">
            {formatTime(currentCapture.capturedAt)}
            {currentCapture.appName && ` · ${currentCapture.appName}`}
          </div>
        </div>

        {/* Dot indicators (for few screenshots) */}
        {capturesWithImages.length > 1 && capturesWithImages.length <= 10 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {capturesWithImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex
                    ? "bg-primary"
                    : "bg-background-tertiary hover:bg-text-tertiary"
                }`}
                aria-label={`Go to screenshot ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close fullscreen"
          >
            <span className="text-xl">×</span>
          </button>

          <img
            src={`data:image/png;base64,${currentCapture.imageData}`}
            alt={currentCapture.activityDescription || "Screenshot"}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Navigation in fullscreen */}
          {capturesWithImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Next screenshot"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
            {currentIndex + 1} / {capturesWithImages.length}
          </div>
        </div>
      )}
    </>
  );
}
