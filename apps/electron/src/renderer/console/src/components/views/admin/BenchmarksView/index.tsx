import { useMemo, useState } from "react";
import { useBenchmarks } from "@/console/src/hooks/queries/benchmarks";
import type { BenchmarkCategory } from "@/console/src/services/benchmarkService";
import { BenchmarkCard } from "./BenchmarkCard";

type CategoryFilter = "all" | BenchmarkCategory;

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "productivity", label: "Productivity" },
  { key: "collaboration", label: "Collaboration" },
  { key: "growth", label: "Growth" },
  { key: "quality", label: "Quality" },
];

const SPINNER_COLOR = "#82C0CC";

export default function BenchmarksView() {
  const { data: benchmarks = [], isLoading } = useBenchmarks();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");

  const filtered = useMemo(() => {
    if (activeCategory === "all") return benchmarks;
    return benchmarks.filter((b) => b.category === activeCategory);
  }, [benchmarks, activeCategory]);

  const activeBenchmarks = benchmarks.filter((b) => b.isActive).length;

  const totalAssigned = useMemo(() => {
    const ids = new Set<string>();
    for (const b of benchmarks) {
      // assignedCount is a count, not IDs — sum of unique assignments as best approximation
      if (b.assignedCount > 0) ids.add(`${b.id}`);
    }
    return benchmarks.reduce((sum, b) => sum + b.assignedCount, 0);
  }, [benchmarks]);

  const avgCompletion = useMemo(() => {
    if (!benchmarks.length) return 0;
    const total = benchmarks.reduce((sum, b) => sum + b.avgProgress, 0);
    return Math.round(total / benchmarks.length);
  }, [benchmarks]);

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
      {/* Header */}
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

        {/* Category filter toggle bar */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "rgba(var(--ui-rgb), 0.05)",
            borderRadius: 7,
            padding: 3,
          }}
        >
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveCategory(f.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 5,
                fontSize: 11,
                fontFamily: "var(--font-sans)",
                color:
                  activeCategory === f.key
                    ? "var(--text-primary)"
                    : "var(--text-tertiary)",
                background:
                  activeCategory === f.key
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

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Active Benchmarks", value: activeBenchmarks },
          { label: "People Assigned", value: totalAssigned },
          { label: "Avg Completion", value: `${avgCompletion}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: "var(--bg-raised)",
              border: "var(--border-hairline)",
              borderRadius: 12,
              padding: "22px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: "1 1 160px",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                fontFamily: "var(--font-sans)",
              }}
            >
              {label}
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
              {value}
            </span>
          </div>
        ))}
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
          {activeCategory === "all"
            ? "No benchmarks found."
            : `No ${activeCategory} benchmarks found.`}
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
