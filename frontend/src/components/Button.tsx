import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        fontWeight: 500,
        borderRadius: 'var(--radius-md)',
        border: variant === 'secondary' ? '1px solid var(--color-border-strong)' : '1px solid transparent',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'background 0.15s, opacity 0.15s',
        // Storlekar — minsta höjd 44px per WCAG 2.5.5
        padding: size === 'sm'
          ? 'var(--space-2) var(--space-3)'
          : size === 'lg'
          ? 'var(--space-4) var(--space-6)'
          : 'var(--space-3) var(--space-5)',
        minHeight: size === 'sm' ? '36px' : '44px',
        fontSize: size === 'sm' ? 'var(--font-size-sm)' : 'var(--font-size-base)',
        // Färger per variant
        background: variant === 'primary'
          ? 'var(--color-primary)'
          : variant === 'danger'
          ? 'var(--color-error)'
          : variant === 'ghost'
          ? 'transparent'
          : 'var(--color-surface)',
        color: variant === 'primary' || variant === 'danger'
          ? '#fff'
          : 'var(--color-text)',
      }}
    >
      {loading ? <Spinner size={16} /> : null}
      {children}
    </button>
  )
}

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      style={{ animation: 'spin 0.7s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
