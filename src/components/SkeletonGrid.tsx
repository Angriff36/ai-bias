import { SkeletonCard } from './ui'

// Skeleton cards mirror the real card structure to reduce layout shift.
export function SkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="template-grid" aria-hidden="true" data-testid="skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
