import { Skeleton } from "@/components/ui/skeleton";

export default function TeamsViewSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: 3 }).map((_, i) => (
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
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton className="h-4 w-40 mb-2" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div style={{ display: "flex", gap: -4, alignItems: "center" }}>
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton
                key={j}
                className="w-7 h-7 rounded-full"
                style={{ marginLeft: j > 0 ? -6 : 0 }}
              />
            ))}
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
