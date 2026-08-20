import { useCallback, useEffect, useRef, useState } from 'react'

// Traps focus within a container while open; Escape triggers onClose.
// Returns focus to the previously focused element on unmount.
export function useFocusTrap(open: boolean, onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement

    const container = ref.current
    if (!container) return

    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

    // Move focus into the panel.
    const first = focusables()[0]
    first?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus?.()
    }
  }, [open, onEscape])

  return ref
}

// A simple polite screen-reader announcer.
export function useAnnounce() {
  const [message, setMessage] = useState('')
  const announce = useCallback((msg: string) => {
    // Clear then set so repeated identical messages re-announce.
    setMessage('')
    window.setTimeout(() => setMessage(msg), 30)
  }, [])
  return { message, announce }
}
