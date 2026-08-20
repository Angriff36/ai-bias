interface Props {
  message?: string
  actionLabel: string
  onAction?: () => void
  icon?: string
  heading?: string
  body?: string
}

export function EmptyState({ message, actionLabel, onAction, icon, heading, body }: Props) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon" aria-hidden="true">{icon}</span>}
      {heading && <h3>{heading}</h3>}
      {(body ?? message) && <p>{body ?? message}</p>}
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
