interface Props {
  message: string
  actionLabel: string
  onAction?: () => void
}

export function EmptyState({ message, actionLabel, onAction }: Props) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      <button className="primary" onClick={onAction}>{actionLabel}</button>
    </div>
  )
}

export function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }, (_, j) => (
            <td key={j}><div /></td>
          ))}
        </tr>
      ))}
    </>
  )
}
