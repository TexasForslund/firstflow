import { PageHeader } from '../components'

interface PlaceholderPageProps {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} subtitle={description} />
      <div
        style={{
          padding: 'var(--space-8)',
          border: '2px dashed var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        Kommer snart
      </div>
    </div>
  )
}
