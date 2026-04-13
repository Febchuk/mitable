import { Skeleton } from "@/components/ui/skeleton";

export default function PersonBenchmarkSkeleton() {
  return (
    <div
      style={{
        height: "100%",
        padding: "28px 0",
        paddingTop: 40,
      }}
    >
      <Skeleton className="h-4 w-20 mb-6" />
      <Skeleton className="h-7 w-56 mb-2" />
      <Skeleton className="h-4 w-80 mb-8" />

      {/* Metrics */}
      <div style={{ display: "flex", gap: 40, marginBottom: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-10 w-20" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-10 w-16" />
        </div>
      </div>

      {/* Chart */}
      <Skeleton className="h-[200px] w-full rounded-lg mb-8" />

      {/* History rows */}
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
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
