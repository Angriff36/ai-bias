// Skeleton matching the three-zone layout: a thin bar at top, two equal
// rectangles below. Shimmer animates left-to-right on a 1.5s loop.
function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded bg-gray-200 ${className}`} />;
}

export function PairInspectorSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-hidden="true">
      <div className="border-b border-gray-200 p-4">
        <Bar className="h-4 w-1/3" />
      </div>
      <div className="grid flex-1 grid-cols-1 xl:grid-cols-2">
        {[0, 1].map((c) => (
          <div key={c} className="border-r border-gray-200 p-4">
            <Bar className="mb-3 h-5 w-24" />
            <div className="mb-4 flex gap-2">
              <Bar className="h-5 w-20 rounded-full" />
              <Bar className="h-5 w-16 rounded-full" />
            </div>
            <Bar className="mb-2 h-3 w-full" />
            <Bar className="mb-2 h-3 w-11/12" />
            <Bar className="mb-2 h-3 w-10/12" />
            <Bar className="h-3 w-9/12" />
          </div>
        ))}
      </div>
    </div>
  );
}
