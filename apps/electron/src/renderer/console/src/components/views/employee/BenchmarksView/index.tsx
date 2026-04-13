import { useMemo } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useNavigate } from "react-router-dom";
import { useMyBenchmarks } from "@/console/src/hooks/queries/benchmarks";
import { BenchmarkProgressCard } from "./BenchmarkProgressCard";
import BenchmarksViewSkeleton from "./BenchmarksViewSkeleton";

// Frequency filters — commented out in UI for now
// type FrequencyFilter = "all" | BenchmarkFrequency;
// const FREQUENCY_FILTERS = [...];

export default function BenchmarksView() {
  const navigate = useNavigate();
  const { data: benchmarks = [], isLoading } = useMyBenchmarks();

  const filtered = benchmarks; // No frequency filtering for now

  // Score: avg progress across filtered
  const score = useMemo(() => {
    if (!filtered.length) return 0;
    const total = filtered.reduce((sum, b) => sum + b.progress, 0);
    return Math.round(total / filtered.length);
  }, [filtered]);

  // Trend: net avg delta across filtered
  const trendLabel = useMemo(() => {
    if (!filtered.length) return "0%";
    const avgDelta = Math.round(
      filtered.reduce((sum, b) => {
        if (b.trend === "improving") return sum + b.trendDelta;
        if (b.trend === "declining") return sum - b.trendDelta;
        return sum;
      }, 0) / filtered.length
    );
    if (avgDelta > 0) return `+${avgDelta}%`;
    return `${avgDelta}%`;
  }, [filtered]);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "28px 0",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Header: title + period toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            fontWeight: 400,
            color: "var(--text-primary)",
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          My Benchmarks
        </h1>

        {/* Frequency filters — hidden for now
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "rgba(var(--ui-rgb), 0.05)",
            borderRadius: 7,
            padding: 3,
          }}
        >
          {FREQUENCY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFrequency(f.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 5,
                fontSize: 11,
                fontFamily: "var(--font-sans)",
                color:
                  activeFrequency === f.key
                    ? "var(--text-primary)"
                    : "var(--text-tertiary)",
                background:
                  activeFrequency === f.key
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        */}
      </div>

      {/* Inline metrics — Score + Trend */}
      <div style={{ display: "flex", gap: 48, alignItems: "baseline" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Score
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--text-primary)",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {score}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Trend
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--text-primary)",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {trendLabel}
          </span>
        </div>
      </div>

      {/* Loading */}
      {isLoading && <BenchmarksViewSkeleton />}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div style={{ padding: "80px 0" }}>
          <EmptyState
            title="No benchmarks assigned yet"
            description="Your manager will assign benchmarks to help track your growth."
          />
        </div>
      )}

      {/* Benchmark cards */}
      {!isLoading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((b) => (
            <BenchmarkProgressCard
              key={b.id}
              benchmark={b}
              onClick={() => navigate(`/benchmarks/${b.benchmarkId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
