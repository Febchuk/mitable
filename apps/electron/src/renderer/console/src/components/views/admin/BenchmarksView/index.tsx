import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useBenchmarks } from "@/console/src/hooks/queries/benchmarks";
import type { BenchmarkFrequency } from "@/console/src/services/benchmarkService";
import { BenchmarkCard } from "./BenchmarkCard";

type FrequencyFilter = "all" | BenchmarkFrequency;

const FREQUENCY_FILTERS: { key: FrequencyFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
];

const SPINNER_COLOR = "#82C0CC";

export default function BenchmarksView() {
  const navigate = useNavigate();
  const { data: benchmarks = [], isLoading } = useBenchmarks();
  const [activeFrequency, setActiveFrequency] = useState<FrequencyFilter>("all");

  const filtered = useMemo(() => {
    if (activeFrequency === "all") return benchmarks;
    return benchmarks.filter((b) => b.frequency === activeFrequency);
  }, [benchmarks, activeFrequency]);

  // Score: avg completion across filtered benchmarks
  const score = useMemo(() => {
    if (!filtered.length) return 0;
    const total = filtered.reduce((sum, b) => sum + b.avgProgress, 0);
    return Math.round(total / filtered.length);
  }, [filtered]);

  // Trend: net avg delta across filtered benchmarks
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
        width: "100%",
        height: "100%",
        overflowY: "auto",
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        boxSizing: "border-box",
      }}
    >
      {/* Header row: title + period toggle */}
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
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          Benchmarks
        </h1>

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
      </div>

      {/* Inline metrics row — like dashboard */}
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

        <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
          <button
            onClick={() => navigate("/benchmarks/new")}
            title="New Benchmark"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "var(--border-hairline)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "background 0.1s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Benchmark grid */}
      {isLoading ? (
        <div style={{ padding: "64px 0", textAlign: "center" }}>
          <div
            className="animate-spin"
            style={{
              width: 24,
              height: 24,
              margin: "0 auto 12px",
              borderRadius: "50%",
              border: `2px solid ${SPINNER_COLOR}33`,
              borderTopColor: SPINNER_COLOR,
            }}
          />
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Loading benchmarks...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "64px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          {activeFrequency === "all"
            ? "No benchmarks found."
            : `No ${activeFrequency} benchmarks found.`}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((benchmark) => (
            <BenchmarkCard key={benchmark.id} benchmark={benchmark} />
          ))}
        </div>
      )}
    </div>
  );
}
