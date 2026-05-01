/**
 * @deprecated SummarizationProgress — progress bar now lives in CalendarView ActivityBlock. Set up for deletion.
 */
import { useState, useEffect, useRef } from "react";

interface PipelineProgress {
  sessionId: string;
  step: string;
  batchIndex?: number;
  totalBatches?: number;
  percent: number;
  label: string;
}

interface SummarizationProgressProps {
  sessionId?: string;
  progress?: string | null;
}

const STEP_ICONS: Record<string, string> = {
  loading_manifest: "Loading session data",
  loading_model: "Loading AI model",
  transcribing: "Processing audio",
  processing_batch: "Analyzing frames",
  generating_summary: "Writing summary",
  exporting: "Finalizing",
  complete: "Complete",
};

export default function SummarizationProgress({ sessionId }: SummarizationProgressProps) {
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [displayPercent, setDisplayPercent] = useState(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window.consoleAPI?.onPipelineProgress) return;

    const unsubscribe = window.consoleAPI.onPipelineProgress((p) => {
      if (sessionId && p.sessionId !== sessionId) return;
      setProgress(p);
    });

    return () => {
      unsubscribe();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [sessionId]);

  useEffect(() => {
    const target = progress?.percent ?? 0;
    const start = displayPercent;
    const diff = target - start;
    if (diff === 0) return;

    const duration = 600;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayPercent(Math.round(start + diff * eased));
      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [progress?.percent]);

  const label = progress?.label ?? "Preparing summary...";
  const stepName = progress?.step ? (STEP_ICONS[progress.step] ?? progress.step) : "Starting";
  const isComplete = progress?.step === "complete";
  const showBatchDetail = progress?.step === "processing_batch" && progress.totalBatches;

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2">
      {/* Percentage display */}
      <div className="relative flex items-center justify-center">
        <span
          className="text-3xl font-semibold tabular-nums transition-colors duration-300"
          style={{ color: isComplete ? "#22c55e" : "var(--text-primary)" }}
        >
          {displayPercent}
          <span className="text-lg font-normal" style={{ color: "var(--text-tertiary)" }}>
            %
          </span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div
          className="h-2 w-full rounded-full overflow-hidden"
          style={{ background: "rgba(255, 255, 255, 0.06)" }}
        >
          <div
            className="h-full rounded-full relative overflow-hidden"
            style={{
              width: `${displayPercent}%`,
              background: isComplete ? "#22c55e" : "linear-gradient(90deg, #6366f1, #818cf8)",
              transition: "width 0.6s cubic-bezier(0.33, 1, 0.68, 1)",
            }}
          >
            {!isComplete && displayPercent > 0 && (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                  animation: "shimmer 2s ease-in-out infinite",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Step label */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </p>
        {showBatchDetail && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Batch {(progress.batchIndex ?? 0) + 1} of {progress.totalBatches}
          </p>
        )}
        {!showBatchDetail && !isComplete && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {stepName}
          </p>
        )}
      </div>

      {/* Shimmer keyframe (injected once) */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
