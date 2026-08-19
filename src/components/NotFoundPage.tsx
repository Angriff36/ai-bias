import { useEffect } from 'react'

/**
 * Generic not-found page. Also shown for records the user does not own,
 * so resource existence is never confirmed to other users.
 */
export function NotFoundPage({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    document.title = 'Page not found — AI Bias Lab'
  }, [])
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <button className="primary" onClick={onBack}>Back to experiments</button>
    </div>
  )
}
