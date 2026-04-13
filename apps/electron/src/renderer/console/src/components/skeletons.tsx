import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Primitives ──────────────────────────────────────────────────────────────

const LINE_WIDTHS = ["w-full", "w-3/4", "w-5/6", "w-2/3", "w-4/5"];

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", LINE_WIDTHS[i % LINE_WIDTHS.length])} />
      ))}
    </div>
  );
}

export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-stroke-subtle bg-canvas-raised p-4", className)}>
      {children ?? (
        <>
          <Skeleton className="h-4 w-2/3 mb-3" />
          <SkeletonText lines={2} />
        </>
      )}
    </div>
  );
}

export function SkeletonBadge({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-16 rounded-full", className)} />;
}

export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return <Skeleton className="rounded-full flex-shrink-0" style={{ width: size, height: size }} />;
}

export function SkeletonChart({
  height = 200,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return <Skeleton className={cn("w-full rounded-lg", className)} style={{ height }} />;
}

export function SkeletonListGroup({
  cardCount = 3,
  cardContent,
  className,
}: {
  cardCount?: number;
  cardContent?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: cardCount }).map((_, i) => (
        <SkeletonCard key={i}>{cardContent}</SkeletonCard>
      ))}
    </div>
  );
}
