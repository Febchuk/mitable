import { Skeleton } from "@/components/ui/skeleton";

export default function AdminBenchmarksViewSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0" }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: "20px 24px",
            borderRadius: 12,
            border: "1px solid var(--stroke-subtle)",
            background: "var(--canvas-raised)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-4 w-12" />
          <Skeleton className="w-5 h-5 rounded" />
        </div>
      ))}
    </div>
  );
}
