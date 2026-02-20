import { X, ArrowLeft } from "lucide-react";
import type { DrillDownData } from "@/console/src/services/adminService";

interface DrillDownPanelProps {
  data: DrillDownData;
  onClose: () => void;
}

export default function DrillDownPanel({ data, onClose }: DrillDownPanelProps) {
  const maxTrend = Math.max(...data.trend.map((t) => t.value));

  return (
    <div className="flex flex-col h-full rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stroke-subtle shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <h2 className="text-lg font-semibold text-text-primary mt-2">{data.title}</h2>
        <p className="text-xs text-text-secondary mt-0.5">{data.subtitle}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {data.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg bg-canvas-overlay border border-stroke-subtle p-3"
            >
              <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
                {stat.label}
              </p>
              <p className="text-lg font-bold text-text-primary mt-0.5">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Daily trend */}
        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Daily Trend
          </h4>
          <div className="flex items-end gap-2 h-[100px]">
            {data.trend.map((point) => (
              <div key={point.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-text-tertiary">{point.value}</span>
                <div
                  className="w-full rounded-t-md bg-indigo transition-all duration-normal"
                  style={{ height: `${(point.value / maxTrend) * 70}px` }}
                />
                <span className="text-[10px] text-text-secondary">{point.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown list */}
        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Breakdown
          </h4>
          <div className="space-y-2.5">
            {data.breakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-text-primary">{item.label}</span>
                  <span className="text-xs text-text-secondary">{item.value}</span>
                </div>
                {item.bar !== undefined && (
                  <div className="h-1.5 rounded-full bg-canvas-overlay overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo transition-all duration-normal"
                      style={{ width: `${item.bar}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
