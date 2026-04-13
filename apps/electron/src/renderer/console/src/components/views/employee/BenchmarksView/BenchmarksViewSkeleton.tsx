import { Skeleton } from "@/components/ui/skeleton";

export default function BenchmarksViewSkeleton() {
  return (
    <div>
      {/* Inline metrics */}
      <div style={{ display: "flex", gap: 48, alignItems: "baseline", marginBottom: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-12 w-20" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-12 w-16" />
        </div>
      </div>

      {/* Benchmark cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              border: "1px solid var(--stroke-subtle)",
              background: "var(--canvas-raised)",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            {/* Score ring placeholder */}
            <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/2 mb-2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
