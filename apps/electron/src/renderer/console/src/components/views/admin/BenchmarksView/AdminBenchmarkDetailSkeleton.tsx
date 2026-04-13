import { Skeleton } from "@/components/ui/skeleton";

export default function AdminBenchmarkDetailSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Back link */}
      <Skeleton className="h-4 w-24" />

      {/* Title + description */}
      <div>
        <Skeleton className="h-7 w-56 mb-3" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Assigned users heading */}
      <Skeleton className="h-5 w-32" />

      {/* User rows */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid var(--stroke-subtle)",
            background: "var(--canvas-raised)",
          }}
        >
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
