import { useState } from "react";
import { Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMyBenchmarks } from "@/console/src/hooks/queries/benchmarks";
import type { MyBenchmark } from "@/console/src/services/benchmarkService";
import { BenchmarkProgressCard } from "./BenchmarkProgressCard";

// ── Types ─────────────────────────────────────────────────────

type PeriodFilter = "weekly" | "monthly" | "all";

const PERIOD_FILTERS: { key: PeriodFilter; label: string }[] = [
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
  { key: "all", label: "All Time" },
];

// ── Helpers ───────────────────────────────────────────────────

function filterByPeriod(benchmarks: MyBenchmark[], period: PeriodFilter): MyBenchmark[] {
  if (period === "all") return benchmarks;
  return benchmarks.filter((b) => b.period === period);
}

// ── Component ─────────────────────────────────────────────────

export default function BenchmarksView() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const { data: benchmarks = [], isLoading } = useMyBenchmarks();

  const visible = filterByPeriod(benchmarks, period);

  const onTrack = visible.filter((b) => b.progress >= 80).length;
  const inProgress = visible.filter((b) => b.progress >= 50 && b.progress < 80).length;
  const needsAttention = visible.filter((b) => b.progress < 50).length;

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "28px 0",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
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

        {/* Period toggle */}
        <div
          style={{
            display: "flex",
            gap: 1,
            background: "rgba(var(--ui-rgb), 0.05)",
            borderRadius: 7,
            padding: 3,
          }}
        >
          {PERIOD_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setPeriod(f.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 5,
                fontSize: 11,
                fontFamily: "var(--font-sans)",
                color: period === f.key ? "var(--text-primary)" : "var(--text-tertiary)",
                background: period === f.key ? "rgba(255,255,255,0.08)" : "transparent",
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

      {/* Summary stats row */}
      {!isLoading && visible.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {[
            { label: "On Track", value: onTrack },
            { label: "In Progress", value: inProgress },
            { label: "Needs Attention", value: needsAttention },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "var(--bg-raised)",
                border: "1px solid var(--border-hairline)",
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 28,
                  fontWeight: 400,
                  color: "var(--text-primary)",
                  lineHeight: 1,
                }}
              >
                {value}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-sans)",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "120px 0",
            color: "var(--text-tertiary)",
            fontSize: 13,
            fontFamily: "var(--font-sans)",
          }}
        >
          Loading...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && visible.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "120px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Target size={40} color="var(--text-tertiary)" />
          <p
            style={{
              fontSize: 14,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-sans)",
              margin: 0,
            }}
          >
            No benchmarks assigned yet
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-sans)",
              margin: 0,
            }}
          >
            Your manager will assign benchmarks to help track your growth.
          </p>
        </div>
      )}

      {/* Benchmark list */}
      {!isLoading && visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((b) => (
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
