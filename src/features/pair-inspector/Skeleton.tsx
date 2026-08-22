// Skeleton matching the three-zone layout: a thin bar at top, two equal
// columns below.
function Bar({ width }: { width: string }) {
  return <div className="skeleton-line" style={{ width }} />;
}

export function PairInspectorSkeleton() {
  return (
    <div className="pi pi-skeleton" aria-hidden="true">
      <div className="pi-header"><Bar width="33%" /></div>
      <div className="pi-columns">
        {[0, 1].map((c) => (
          <div key={c} className="pi-col">
            <Bar width="30%" />
            <Bar width="100%" />
            <Bar width="90%" />
            <Bar width="80%" />
            <Bar width="70%" />
          </div>
        ))}
      </div>
    </div>
  );
}
