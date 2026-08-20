import type { ReactNode } from 'react'

// Small shared design-system primitives so buttons/inputs stay consistent.

export function Spinner({ label }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
    />
  )
}

// Checkmark and cross icons pair with text so meaning never relies on color.
export function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
      <path d="M7.5 13.5 4 10l1.4-1.4 2.1 2.1L14.6 4l1.4 1.4z" />
    </svg>
  )
}
export function CrossIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
      <path d="M6 5 5 6l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4z" />
    </svg>
  )
}
export function WarnIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
      <path d="M10 2 1 18h18L10 2zm0 5 .9 6h-1.8L9 7h2zm0 8a1 1 0 110 2 1 1 0 010-2z" />
    </svg>
  )
}

type BtnProps = {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  className?: string
  ariaLabel?: string
}

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  variant = 'secondary',
  className = '',
  ariaLabel,
}: BtnProps) {
  const base =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
  const variants: Record<string, string> = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    danger: 'bg-red-700 text-white hover:bg-red-800',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
