/**
 * @deprecated MonitoringViewSkeleton — replaced by CalendarView. Set up for deletion.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonBadge } from "@/console/src/components/skeletons";

function SkeletonSessionRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-canvas-overlay/50">
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-muted" />
      <Skeleton className="w-36 h-4 flex-shrink-0" />
      <Skeleton className="flex-1 h-4" />
      <Skeleton className="w-14 h-4" />
      <Skeleton className="w-16 h-4" />
      <SkeletonBadge />
    </div>
  );
}

export default function MonitoringViewSkeleton() {
  return (
    <div className="h-full overflow-hidden">
      {/* Hero section */}
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
          <Skeleton className="h-9 w-64 rounded-md" />
        </div>

        {/* Start session hero card skeleton */}
        <div className="rounded-2xl border border-stroke-subtle bg-canvas-overlay/50 p-8">
          <div className="flex items-center gap-5">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div className="flex-1">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-72 mt-2" />
            </div>
            <Skeleton className="w-10 h-10 rounded-full" />
          </div>
        </div>
      </div>

      {/* Session timeline */}
      <div className="px-8 pb-8 space-y-6">
        {[0, 1].map((group) => (
          <div key={group}>
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-3 w-28" />
              <div className="flex-1 h-px bg-stroke-subtle" />
              <Skeleton className="h-3 w-4" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: group === 0 ? 3 : 2 }).map((_, i) => (
                <SkeletonSessionRow key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
