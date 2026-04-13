import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonText } from "@/console/src/components/skeletons";

export default function DocDetailSkeleton() {
  return (
    <div className="p-8 space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
        <div className="flex-1">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-40 mt-2" />
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Document body */}
      <div className="space-y-4 pt-4">
        <SkeletonText lines={5} />
        <Skeleton className="h-3 w-0" /> {/* spacer */}
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
