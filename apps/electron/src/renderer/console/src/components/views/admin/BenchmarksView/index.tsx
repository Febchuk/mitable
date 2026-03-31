import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBenchmarks, useDeleteBenchmark } from "@/console/src/hooks/queries/benchmarks";
import type { Benchmark } from "@/console/src/services/benchmarkService";
import { BenchmarkCard } from "./BenchmarkCard";

// Frequency filters — commented out in UI for now
// type FrequencyFilter = "all" | BenchmarkFrequency;
// const FREQUENCY_FILTERS = [
//   { key: "all", label: "All" },
//   { key: "daily", label: "Daily" },
//   { key: "weekly", label: "Weekly" },
//   { key: "monthly", label: "Monthly" },
//   { key: "quarterly", label: "Quarterly" },
// ];

const SPINNER_COLOR = "#82C0CC";

export default function BenchmarksView() {
  const navigate = useNavigate();
  const { data: benchmarks = [], isLoading } = useBenchmarks();
  const { mutate: deleteBenchmark } = useDeleteBenchmark();
  // const [activeFrequency, setActiveFrequency] = useState<FrequencyFilter>("all");

  // Delete confirmation state
  const [deletingBenchmark, setDeletingBenchmark] = useState<Benchmark | null>(null);

  const filtered = benchmarks; // No frequency filtering for now

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

  function handleDelete(benchmark: Benchmark) {
    setDeletingBenchmark(benchmark);
  }

  function confirmDelete() {
    if (!deletingBenchmark) return;
    deleteBenchmark(deletingBenchmark.id);
    setDeletingBenchmark(null);
  }

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
      ) : benchmarks.length === 0 ? (
        /* Empty state — no benchmarks created yet */
        <div style={{ padding: "80px 0" }}>
          <EmptyState
            title="Create your first benchmark"
            description="Benchmarks use AI to score your team across custom parameters. Define what matters and track progress over time."
            actions={
              <button
                onClick={() => navigate("/benchmarks/new")}
                style={{
                  height: 34,
                  padding: "0 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  background: "#82C0CC",
                  color: "#1A1916",
                  transition: "opacity 0.15s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={14} />
                New Benchmark
              </button>
            }
          />
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
          No matching benchmarks found.
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
            <BenchmarkCard
              key={benchmark.id}
              benchmark={benchmark}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deletingBenchmark && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
          }}
          onClick={() => setDeletingBenchmark(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-raised)",
              border: "var(--border-hairline)",
              borderRadius: 14,
              padding: 24,
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 18,
                fontWeight: 400,
                color: "var(--text-primary)",
                margin: "0 0 8px",
              }}
            >
              Delete Benchmark
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                margin: "0 0 20px",
              }}
            >
              Are you sure you want to delete <strong>{deletingBenchmark.name}</strong>? This will remove all assignments, scores, and history. This action cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setDeletingBenchmark(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  border: "var(--border-hairline)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  border: "none",
                  background: "#c04040",
                  color: "#fff",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
