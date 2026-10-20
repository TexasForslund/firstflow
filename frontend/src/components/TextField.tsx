import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function TextField({ label, error, hint, id, ...props }: TextFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`
  const errorId = `${fieldId}-error`
  const hintId = `${fieldId}-hint`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <label
        htmlFor={fieldId}
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
          color: 'var(--color-text)',
        }}
      >
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        style={{
          padding: 'var(--space-3) var(--space-4)',
          border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-md)',
          background: error ? 'var(--color-error-light)' : 'var(--color-bg)',
          color: 'var(--color-text)',
          fontSize: 'var(--font-size-base)',
          minHeight: '44px',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          width: '100%',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--color-primary)'
          e.target.style.boxShadow = '0 0 0 3px var(--color-primary-light)'
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error ? 'var(--color-error)' : 'var(--color-border-strong)'
          e.target.style.boxShadow = 'none'
          props.onBlur?.(e)
        }}
      />
      {hint && !error && (
        <span id={hintId} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          id={errorId}
          role="alert"
          style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error)', fontWeight: 500 }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
