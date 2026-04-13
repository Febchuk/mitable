import { Skeleton } from "@/components/ui/skeleton";

export default function PermissionsTabSkeleton() {
  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Section header */}
      <Skeleton className="h-6 w-40 mb-2" />
      <Skeleton className="h-4 w-80 mb-5" />

      {/* Search bar */}
      <Skeleton className="h-9 w-80 rounded-lg mb-5" />

      {/* User rows */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            borderBottom: "1px solid var(--stroke-subtle)",
          }}
        >
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
