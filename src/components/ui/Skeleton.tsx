// Loading placeholders that occupy the same box as the content they stand in
// for. Reserving the space up front is what keeps cumulative layout shift at
// zero — a spinner that is replaced by a grid of cards reflows the whole page.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Placeholder matching the dashboard's stat row. */
export function StatSkeleton() {
  return (
    <div className="card p-4 sm:p-5">
      <Skeleton className="h-4 w-4 rounded-md" />
      <Skeleton className="mt-3 h-9 w-16" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}

/** Placeholder matching a crew card. */
export function CrewCardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-2xl" />
        <div className="flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
      </div>
      <Skeleton className="mt-4 h-6 w-24 rounded-full" />
    </div>
  );
}
