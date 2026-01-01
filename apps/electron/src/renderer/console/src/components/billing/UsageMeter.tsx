/**
 * UsageMeter Component
 *
 * Displays usage progress with color-coded status.
 * Shows warning colors as usage approaches limits.
 */

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number | null; // null = unlimited
  className?: string;
}

export default function UsageMeter({ label, used, limit, className = "" }: UsageMeterProps) {
  // Handle unlimited case
  if (limit === null) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">{label}</span>
          <span className="text-text-primary font-medium">{used.toLocaleString()} used</span>
        </div>
        <div className="h-2 w-full bg-background-elevated rounded-full overflow-hidden">
          <div className="h-full bg-purple-500/50 w-full" />
        </div>
        <p className="text-xs text-text-tertiary">Unlimited</p>
      </div>
    );
  }

  const percent = Math.min((used / limit) * 100, 100);
  const isWarning = percent >= 80;
  const isCritical = percent >= 95;

  // Color based on usage level
  const getBarColor = () => {
    if (isCritical) return "bg-red-500";
    if (isWarning) return "bg-yellow-500";
    return "bg-primary";
  };

  const getTextColor = () => {
    if (isCritical) return "text-red-400";
    if (isWarning) return "text-yellow-400";
    return "text-text-primary";
  };

  const remaining = Math.max(limit - used, 0);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className={`font-medium ${getTextColor()}`}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full bg-background-elevated rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-text-tertiary">
        {remaining.toLocaleString()} remaining ({Math.round(100 - percent)}%)
      </p>
    </div>
  );
}
