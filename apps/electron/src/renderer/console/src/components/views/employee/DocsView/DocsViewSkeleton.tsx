import { Skeleton } from "@/components/ui/skeleton";

function SkeletonDocCard() {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        border: "1px solid var(--stroke-subtle)",
        background: "var(--canvas-raised)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3 mt-2" />
          </div>
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

export default function DocsViewSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-4 w-64 mt-3" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Date groups */}
      {[0, 1].map((group) => (
        <div key={group} style={{ marginBottom: 24 }}>
          <Skeleton className="h-3 w-28 mb-3" />
          {Array.from({ length: group === 0 ? 3 : 2 }).map((_, i) => (
            <SkeletonDocCard key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}
