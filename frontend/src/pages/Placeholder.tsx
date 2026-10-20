/** Tillfällig sida för vyer som inte är byggda än. */
export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ maxWidth: 'var(--main-column)' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>{title}</h1>
      <div
        style={{
          padding: 'var(--space-10) var(--space-6)',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-md)',
        }}
      >
        {description}
      </div>
    </div>
  )
}
