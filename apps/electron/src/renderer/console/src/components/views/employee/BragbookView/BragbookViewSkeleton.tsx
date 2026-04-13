import { Skeleton } from "@/components/ui/skeleton";

export default function BragbookViewSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Left: TOC Sidebar skeleton */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          padding: "24px 16px",
          borderRight: "1px solid var(--stroke-subtle)",
        }}
      >
        <Skeleton className="h-6 w-28 mb-2" />
        <Skeleton className="h-3 w-36 mb-6" />

        {/* View toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>

        {/* Period list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}
            >
              <Skeleton className="w-2 h-2 rounded-full flex-shrink-0" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Right: Document area skeleton */}
      <div style={{ flex: 1, padding: "24px 32px" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ marginBottom: 32 }}>
            <Skeleton className="h-5 w-40 mb-4" />
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--stroke-subtle)",
                  background: "var(--canvas-raised)",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
