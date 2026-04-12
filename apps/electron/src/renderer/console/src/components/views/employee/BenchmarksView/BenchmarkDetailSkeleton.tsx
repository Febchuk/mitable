import { Skeleton } from "@/components/ui/skeleton";

export default function BenchmarkDetailSkeleton() {
  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        paddingTop: 40,
        paddingRight: 0,
        paddingBottom: 28,
        paddingLeft: 0,
      }}
    >
      {/* Back link */}
      <Skeleton className="h-4 w-20 mb-6" />

      {/* Title + description */}
      <Skeleton className="h-8 w-64 mb-3" />
      <Skeleton className="h-4 w-96 mb-8" />

      {/* Metrics row */}
      <div style={{ display: "flex", gap: 40, marginBottom: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>

      {/* Chart area */}
      <Skeleton className="h-[200px] w-full rounded-lg mb-8" />

      {/* History table */}
      <Skeleton className="h-4 w-20 mb-4" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 0",
            borderBottom: "1px solid var(--stroke-subtle)",
          }}
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: 120 }} />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
