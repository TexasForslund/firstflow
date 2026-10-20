interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-12) var(--space-4)',
        gap: 'var(--space-4)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <div
        style={{
          width: '3rem',
          height: '3rem',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
        }}
      >
        📭
      </div>
      <div>
        <p style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 'var(--font-size-base)' }}>
          {title}
        </p>
        {description && (
          <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
