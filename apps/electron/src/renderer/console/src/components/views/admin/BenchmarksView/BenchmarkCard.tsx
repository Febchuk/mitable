import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Benchmark } from "@/console/src/services/benchmarkService";
import { CategoryBadge } from "../../shared/benchmarks/CategoryBadge";
import { BenchmarkProgressBar } from "../../shared/benchmarks/BenchmarkProgressBar";
import { TrendArrow } from "../../shared/benchmarks/TrendArrow";

const PERIOD_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export function BenchmarkCard({ benchmark }: { benchmark: Benchmark }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => navigate(`/benchmarks/${benchmark.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(255,255,255,0.02)"
          : "var(--bg-raised)",
        border: "var(--border-hairline)",
        borderRadius: 12,
        padding: 20,
        cursor: "pointer",
        transition: "background 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Name + CategoryBadge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
          }}
        >
          {benchmark.name}
        </span>
        <CategoryBadge category={benchmark.category} />
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {benchmark.description}
      </div>

      {/* Assigned count + progress bar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {benchmark.assignedCount} {benchmark.assignedCount === 1 ? "person" : "people"} assigned
          </span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {Math.round(benchmark.avgProgress)}%
          </span>
        </div>
        <BenchmarkProgressBar progress={benchmark.avgProgress} size="sm" />
      </div>

      {/* Trend + period */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TrendArrow trend={benchmark.trend} delta={benchmark.trendDelta} />
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {PERIOD_LABELS[benchmark.period] ?? benchmark.period}
        </span>
      </div>
    </div>
  );
}
