import { useState } from "react";
import type { MyBenchmark } from "@/console/src/services/benchmarkService";
import { TrendArrow } from "../../shared/benchmarks/TrendArrow";
import { PercentileBadge } from "../../shared/benchmarks/PercentileBadge";
import { BenchmarkProgressBar } from "../../shared/benchmarks/BenchmarkProgressBar";

interface BenchmarkProgressCardProps {
  benchmark: MyBenchmark;
  onClick: () => void;
}

const PERIOD_LABELS: Record<MyBenchmark["period"], string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
};

export function BenchmarkProgressCard({ benchmark, onClick }: BenchmarkProgressCardProps) {
  const [hovered, setHovered] = useState(false);

  const {
    name,
    currentValue,
    targetValue,
    unit,
    progress,
    percentile,
    trend,
    trendDelta,
    period,
    topAccomplishment,
  } = benchmark;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.02)" : "var(--bg-raised)",
        border: "1px solid var(--border-hairline)",
        borderRadius: 12,
        padding: 20,
        cursor: "pointer",
        transition: "background 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Top row: name + percentile badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-primary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {name}
        </span>
        <PercentileBadge percentile={percentile} />
      </div>

      {/* Progress bar */}
      <BenchmarkProgressBar progress={progress} size="md" />

      {/* Value/target + progress percent */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {currentValue} / {targetValue} {unit}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {Math.round(progress)}%
        </span>
      </div>

      {/* Bottom row: trend + period */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TrendArrow trend={trend} delta={trendDelta} />
        <span
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {PERIOD_LABELS[period]}
        </span>
      </div>

      {/* Top accomplishment callout */}
      {topAccomplishment && (
        <div
          style={{
            background: "rgba(var(--ui-rgb), 0.04)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-sans)",
              lineHeight: 1.5,
            }}
          >
            {topAccomplishment}
          </span>
        </div>
      )}
    </div>
  );
}
