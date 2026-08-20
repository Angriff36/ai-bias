/** Skeleton that matches the verdict-card shape while scores compute. */
export default function VerdictCardSkeleton() {
  return (
    <section className="verdict-card" data-testid="verdict-skeleton" aria-hidden="true">
      <div className="skeleton skeleton-line skeleton-label" />
      <div className="skeleton skeleton-line skeleton-score" />
      <div className="skeleton skeleton-line" style={{ width: '80%' }} />
    </section>
  );
}
