import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MetricData } from "./mockData";

interface MetricCardsProps {
  metrics: MetricData[];
  onDrillDown: (label: string) => void;
}

function ChangeIndicator({ change, changeType }: Pick<MetricData, "change" | "changeType">) {
  const icon = {
    up: <TrendingUp size={14} />,
    down: <TrendingDown size={14} />,
    neutral: <Minus size={14} />,
  }[changeType];

  const color = {
    up: "text-emerald",
    down: "text-status-error",
    neutral: "text-text-secondary",
  }[changeType];

  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      {icon}
      {change}
    </span>
  );
}

export default function MetricCards({ metrics, onDrillDown }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5 cursor-pointer hover:border-stroke hover:bg-canvas-overlay transition-all duration-normal group"
          title={metric.description}
          onClick={() => onDrillDown(metric.label)}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
          <div className="relative space-y-2">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              {metric.label}
            </p>
            <p className="text-3xl font-bold text-text-primary">{metric.value}</p>
            <ChangeIndicator change={metric.change} changeType={metric.changeType} />
          </div>
        </div>
      ))}
    </div>
  );
}
