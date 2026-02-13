import { Loader2 } from "lucide-react";

const STEPS = [
  { key: "generating_title", label: "Generating title...", percent: 15 },
  { key: "analyzing_activities", label: "Analyzing activities...", percent: 35 },
  { key: "applying_preferences", label: "Applying preferences...", percent: 55 },
  { key: "writing_summary", label: "Writing summary...", percent: 75 },
  { key: "finalizing", label: "Almost done...", percent: 90 },
] as const;

type ProgressStep = (typeof STEPS)[number]["key"];

interface SummarizationProgressProps {
  progress: ProgressStep | string | null;
}

export default function SummarizationProgress({ progress }: SummarizationProgressProps) {
  const currentStep = STEPS.find((s) => s.key === progress);
  const percent = currentStep?.percent ?? 10;
  const label = currentStep?.label ?? "Preparing summary...";

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <Loader2 className="animate-spin text-indigo" size={24} />
      <p className="text-sm font-medium text-ink-primary">Generating summary</p>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo transition-all duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Step label */}
      <p className="text-xs text-ink-tertiary">{label}</p>
    </div>
  );
}
