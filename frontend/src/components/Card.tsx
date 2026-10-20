import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
}

export function Card({ padding = 'md', style, children, ...props }: CardProps) {
  const paddingMap = {
    sm: 'var(--space-3)',
    md: 'var(--space-4) var(--space-5)',
    lg: 'var(--space-6)',
  }

  return (
    <div
      {...props}
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: paddingMap[padding],
        ...style,
      }}
    >
      {children}
    </div>
  )
}
