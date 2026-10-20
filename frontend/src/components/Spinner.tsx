interface SpinnerProps {
  size?: number
  label?: string
}

export function Spinner({ size = 24, label = 'Laddar…' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        aria-hidden="true"
        style={{ animation: 'ff-spin 0.7s linear infinite', color: 'var(--color-primary)' }}
      >
        <style>{`@keyframes ff-spin { to { transform: rotate(360deg) } }`}</style>
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  )
}
