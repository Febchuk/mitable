import { Skeleton } from "@/components/ui/skeleton";

function SkeletonWorkBlock() {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--stroke-subtle)",
          background: "var(--canvas-raised)",
        }}
      >
        <Skeleton className="w-16 h-4 flex-shrink-0" />
        <Skeleton className="flex-1 h-4" />
        <Skeleton className="w-12 h-4" />
      </div>
    </div>
  );
}

export default function CalendarViewSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "64px 0",
        gap: 12,
      }}
    >
      <Skeleton className="h-3 w-20" style={{ marginBottom: 8 }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonWorkBlock key={i} />
      ))}
    </div>
  );
}
