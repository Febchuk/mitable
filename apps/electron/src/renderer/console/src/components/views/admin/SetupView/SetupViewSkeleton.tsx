import { Skeleton } from "@/components/ui/skeleton";

export default function SetupViewSkeleton() {
  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Section header */}
      <Skeleton className="h-6 w-36 mb-2" />
      <Skeleton className="h-4 w-80 mb-5" />

      {/* Settings rows */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
            borderBottom: "1px solid var(--stroke-subtle)",
          }}
        >
          <div>
            <Skeleton className="h-4 w-40 mb-1" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      ))}
    </div>
  );
}
