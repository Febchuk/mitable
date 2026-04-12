import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonText, SkeletonBadge } from "@/console/src/components/skeletons";

export default function SessionDetailSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40 mt-2" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Status + duration bar */}
      <div className="flex items-center gap-3">
        <SkeletonBadge className="w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Summary section */}
      <div className="rounded-xl border border-stroke-subtle bg-canvas-raised p-5 space-y-4">
        <Skeleton className="h-5 w-24" />
        <SkeletonText lines={4} />
      </div>

      {/* Tasks section */}
      <div className="rounded-xl border border-stroke-subtle bg-canvas-raised p-5 space-y-3">
        <Skeleton className="h-5 w-20" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${70 - i * 15}%` }} />
          </div>
        ))}
      </div>

      {/* Screenshots area */}
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
