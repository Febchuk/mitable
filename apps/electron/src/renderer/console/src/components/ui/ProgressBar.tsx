interface ProgressBarProps {
  percentage: number;
  height?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export default function ProgressBar({
  percentage,
  height = "md",
  showLabel = false,
  className = "",
}: ProgressBarProps) {
  const heightStyles = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-xs">
          <span className="text-xs text-text-secondary">{clampedPercentage}%</span>
        </div>
      )}
      <div
        className={`w-full bg-background-elevated rounded-full overflow-hidden ${heightStyles[height]}`}
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
    </div>
  );
}
