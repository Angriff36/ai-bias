// Skeleton cards mirror the real card structure to reduce layout shift.
export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
      data-testid="skeleton-grid"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 h-6 w-1/2 animate-pulse rounded bg-slate-200" />
          <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="mb-4 h-4 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
