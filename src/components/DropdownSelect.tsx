import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface DropdownOption {
  value: string
  label: string
}

export function DropdownSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const openAt = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
    window.setTimeout(() => optionRefs.current[index]?.focus())
  }

  const choose = (index: number) => {
    onChange(options[index].value)
    setActiveIndex(index)
    setOpen(false)
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(event.key === 'ArrowDown' ? selectedIndex : options.length - 1)
    }
  }

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      rootRef.current?.querySelector<HTMLButtonElement>('.dropdown-trigger')?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    setActiveIndex(next)
    optionRefs.current[next]?.focus()
  }

  return (
    <div className="dropdown-field" ref={rootRef}>
      <span className="dropdown-label">{label}</span>
      <button
        type="button"
        className="dropdown-trigger"
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => open ? setOpen(false) : openAt(selectedIndex)}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected.label}</span><span className="dropdown-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div id={listId} className="dropdown-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={index === activeIndex ? 'active' : ''}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              onKeyDown={onOptionKeyDown}
            >
              <span>{option.label}</span>
              {option.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
