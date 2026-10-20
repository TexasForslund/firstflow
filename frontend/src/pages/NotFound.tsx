import { ButtonLink } from '../components'

/** Visas när en resurs inte finns eller användaren saknar åtkomst. API:t svarar likadant för båda. */
export function NotFound({ what }: { what: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 'var(--main-column)' }}>
      <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>{what} hittades inte</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-md)' }}>
        Den kan ha tagits bort, eller så har du inte tillgång till den.
      </p>
      <div>
        <ButtonLink to="/">Till startsidan</ButtonLink>
      </div>
    </div>
  )
}
