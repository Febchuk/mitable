import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Benchmark } from "@/console/src/services/benchmarkService";

const RING_SIZE = 64;
const STROKE_WIDTH = 4;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ScoreRing({ progress }: { progress: number }) {
  const clamped = Math.min(100, Math.max(0, progress));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  // Green/amber/red using the app's status colors, with shade variation
  let strokeColor: string;
  if (clamped >= 70) {
    // Green zone — deeper green as score rises
    const l = 52 - ((clamped - 70) / 30) * 12; // 52% → 40%
    strokeColor = `hsl(150, 45%, ${l}%)`;
  } else if (clamped >= 40) {
    // Amber zone — deeper amber as score drops toward 40
    const l = 62 - ((70 - clamped) / 30) * 10; // 62% → 52%
    strokeColor = `hsl(28, 55%, ${l}%)`;
  } else {
    // Red zone — deeper red as score drops toward 0
    const l = 55 - ((40 - clamped) / 40) * 12; // 55% → 43%
    strokeColor = `hsl(0, 55%, ${l}%)`;
  }

  return (
    <div style={{ position: "relative", width: RING_SIZE, height: RING_SIZE, flexShrink: 0 }}>
      <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(var(--ui-rgb), 0.06)"
          strokeWidth={STROKE_WIDTH}
        />
        {/* Fill arc */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Center score */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 24,
            fontWeight: 400,
            color: "var(--text-primary)",
            letterSpacing: -0.5,
            lineHeight: 1,
          }}
        >
          {Math.round(clamped)}
        </span>
      </div>
    </div>
  );
}

export function BenchmarkCard({ benchmark }: { benchmark: Benchmark }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const trendLabel =
    benchmark.trend === "improving"
      ? `+${benchmark.trendDelta}%`
      : benchmark.trend === "declining"
        ? `-${benchmark.trendDelta}%`
        : benchmark.trend === "new"
          ? "New"
          : "0%";

  const trendColor =
    benchmark.trend === "improving"
      ? "#3A9B6B"
      : benchmark.trend === "declining"
        ? "#D4A27A"
        : "var(--text-tertiary)";

  return (
    <div
      onClick={() => navigate(`/benchmarks/${benchmark.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.02)" : "var(--bg-raised)",
        border: "var(--border-hairline)",
        borderRadius: 12,
        padding: 20,
        cursor: "pointer",
        transition: "background 0.15s ease",
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      {/* Score ring */}
      <ScoreRing progress={benchmark.avgProgress} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Name */}
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {benchmark.name}
        </span>

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

        {/* Bottom row: frequency + trend with icon */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "capitalize" }}>
            {benchmark.period}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: trendColor }}>
            {benchmark.trend === "improving" ? (
              <TrendingUp size={14} />
            ) : benchmark.trend === "declining" ? (
              <TrendingDown size={14} />
            ) : (
              <Minus size={14} />
            )}
            {trendLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
