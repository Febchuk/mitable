interface BenchmarkProgressBarProps {
  progress: number;
  size?: "sm" | "md";
}

function getFillColor(progress: number): string {
  if (progress >= 80) return "bg-[#3A9B6B]";
  if (progress >= 50) return "bg-[#82C0CC]";
  return "bg-white/20";
}

export function BenchmarkProgressBar({ progress, size = "sm" }: BenchmarkProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const trackHeight = size === "md" ? "h-2.5" : "h-1.5";
  const fillColor = getFillColor(clampedProgress);

  return (
    <div className={`w-full rounded-full bg-white/5 ${trackHeight}`}>
      <div
        className={`${trackHeight} rounded-full transition-all duration-500 ${fillColor}`}
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  );
}
