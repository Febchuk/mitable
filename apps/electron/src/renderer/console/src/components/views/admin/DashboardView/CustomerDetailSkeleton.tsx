import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerDetailSkeleton() {
  return (
    <div className="h-full overflow-hidden p-6 space-y-5">
      {/* Header */}
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-stroke-subtle bg-canvas-raised p-4">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <Skeleton className="h-[280px] w-full rounded-xl" />

      {/* Activity section */}
      <Skeleton className="h-4 w-28 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 flex-1" style={{ maxWidth: 200 }} />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
