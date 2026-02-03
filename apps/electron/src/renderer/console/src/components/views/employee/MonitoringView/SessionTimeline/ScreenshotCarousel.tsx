/**
 * ScreenshotCarousel
 *
 * Screenshot viewer with navigation for the detail panel.
 * Clean design without decorative icons.
 */

import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { SessionCapture } from "@/console/src/services/monitoringService";
import { formatTime } from "./utils/formatDuration";

interface ScreenshotCarouselProps {
  captures: SessionCapture[];
  className?: string;
}

export default function ScreenshotCarousel({ captures, className = "" }: ScreenshotCarouselProps) {
  // Filter to captures that have image data
  const capturesWithImages = captures.filter((c) => c.imageData);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset index if captures change
  useEffect(() => {
    setCurrentIndex(0);
  }, [capturesWithImages.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : capturesWithImages.length - 1));
  }, [capturesWithImages.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < capturesWithImages.length - 1 ? prev + 1 : 0));
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
      <div
        className={`flex items-center justify-center bg-canvas-muted/30 rounded-xl p-8 ${className}`}
      >
        <p className="text-sm text-ink-tertiary">No screenshots available</p>
      </div>
    );
  }

  // Ensure currentIndex is within bounds (can be out of sync when array changes)
  const safeIndex = Math.min(Math.max(0, currentIndex), capturesWithImages.length - 1);
  const currentCapture = capturesWithImages[safeIndex];

  // Extra safety check - should never happen but prevents crash
  if (!currentCapture) {
    return (
      <div
        className={`flex items-center justify-center bg-canvas-muted/30 rounded-xl p-8 ${className}`}
      >
        <p className="text-sm text-ink-tertiary">Loading screenshots...</p>
      </div>
    );
  }

  return (
    <>
      <div className={`relative group ${className}`}>
        {/* Main image container */}
        <div className="relative bg-canvas-muted/30 rounded-xl overflow-hidden aspect-video">
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
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-canvas-base/80 text-ink-secondary opacity-0 group-hover:opacity-100 transition-all hover:bg-canvas-base hover:text-ink-primary"
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-canvas-base/80 text-ink-secondary opacity-0 group-hover:opacity-100 transition-all hover:bg-canvas-base hover:text-ink-primary"
                aria-label="Next screenshot"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Fullscreen button */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 rounded-lg bg-canvas-base/80 text-ink-tertiary opacity-0 group-hover:opacity-100 transition-all hover:bg-canvas-base hover:text-ink-primary"
            aria-label="View fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Caption */}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-ink-secondary tabular-nums">
            {currentIndex + 1} / {capturesWithImages.length}
          </span>
          <span className="text-ink-tertiary tabular-nums">
            {formatTime(currentCapture.capturedAt)}
            {currentCapture.appName && (
              <span className="ml-2 text-ink-tertiary">{currentCapture.appName}</span>
            )}
          </span>
        </div>

        {/* Dot indicators (for few screenshots) */}
        {capturesWithImages.length > 1 && capturesWithImages.length <= 10 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {capturesWithImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  index === currentIndex ? "bg-indigo" : "bg-canvas-muted hover:bg-ink-tertiary"
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
          className="fixed inset-0 z-50 bg-canvas-base/95 flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-canvas-overlay text-ink-secondary hover:text-ink-primary transition-colors"
            aria-label="Close fullscreen"
          >
            <X className="w-5 h-5" />
          </button>

          <img
            src={`data:image/png;base64,${currentCapture.imageData}`}
            alt={currentCapture.activityDescription || "Screenshot"}
            className="max-w-full max-h-full object-contain rounded-lg"
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
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-lg bg-canvas-overlay text-ink-secondary hover:text-ink-primary transition-colors"
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-lg bg-canvas-overlay text-ink-secondary hover:text-ink-primary transition-colors"
                aria-label="Next screenshot"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-ink-primary text-sm bg-canvas-overlay px-4 py-2 rounded-lg tabular-nums">
            {currentIndex + 1} / {capturesWithImages.length}
          </div>
        </div>
      )}
    </>
  );
}
