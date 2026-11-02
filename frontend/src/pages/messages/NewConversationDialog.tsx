import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { ApiError } from '../../api/errors'
import { useContacts, useStartConversation, type Person } from '../../api/messages'
import { Avatar, Button, SearchInput, TextField, matches } from '../../components'
import styles from './Messages.module.css'

const FILTERS = [
  { key: 'all', label: 'Alla' },
  { key: 'Elev', label: 'Elever' },
  { key: 'Handledare', label: 'Handledare' },
  { key: 'Lärare', label: 'Lärare' },
] as const

const role = (person: Person) => person.description.split(' · ')[0]

/** Nytt meddelande: välj en person, eller flera för en grupp. */
export function NewConversationDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void
  onStarted: (id: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = ref.current
    if (node && !node.open) node.showModal()
  }, [])

  const contacts = useContacts()
  const start = useStartConversation()
  const [chosen, setChosen] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [name, setName] = useState('')

  const people = contacts.data ?? []
  const roles = new Set(people.map(role))
  const filters = FILTERS.filter((f) => f.key === 'all' || roles.has(f.key))
  const shown = people.filter(
    (p) => (filter === 'all' || role(p) === filter) && matches(`${p.name} ${p.description}`, search),
  )
  const isGroup = chosen.length > 1

  function toggle(id: string) {
    setChosen((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (chosen.length === 0) return
    start.mutate(
      { member_ids: chosen, name: isGroup && name.trim() ? name.trim() : null },
      { onSuccess: (c) => onStarted(c.id) },
    )
  }

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="new-conversation-title">
      <form className={styles.dialogFrame} onSubmit={submit}>
        <header className={styles.dialogHead}>
          <h2 id="new-conversation-title" className={styles.dialogTitle}>
            Nytt meddelande
          </h2>
          <button type="button" className={styles.close} aria-label="Stäng" onClick={() => ref.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.dialogBody}>
          <p className={styles.muted}>Välj en person, eller flera för en grupp.</p>
          {chosen.length > 0 && (
            <ul className={styles.pending} aria-label="Valda">
              {chosen.map((id) => {
                const person = people.find((p) => p.id === id)
                return (
                  <li key={id} className={styles.chip} data-tone="primary">
                    {person?.name}
                    <button type="button" aria-label={`Ta bort ${person?.name}`} onClick={() => toggle(id)}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <SearchInput value={search} onChange={setSearch} label="Sök person" placeholder="Sök …" />
          {filters.length > 2 && (
            <div className={styles.filters}>
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={styles.filter}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {contacts.isPending ? (
            <p className={styles.muted}>Laddar…</p>
          ) : people.length === 0 ? (
            <p className={styles.muted}>
              Det finns ingen du kan skriva till än. Elever, handledare och lärare dyker upp här när de är kopplade till
              dig.
            </p>
          ) : (
            <ul className={styles.people}>
              {shown.map((p) => {
                const on = chosen.includes(p.id)
                return (
                  <li key={p.id}>
                    <label className={styles.person} data-on={on ? '' : undefined}>
                      <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                      <span className={styles.check} aria-hidden="true">
                        {on && <Check />}
                      </span>
                      <Avatar name={p.name} size="sm" />
                      <span className={styles.cardText}>
                        <span className={styles.cardTitle}>{p.name}</span>
                        <span className={styles.cardSub}>{p.description}</span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {isGroup && (
            <TextField
              label="Gruppens namn (valfritt)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="T.ex. Hugo på Kramfors El"
            />
          )}
          {start.isError && (
            <p className={styles.error} role="alert">
              {start.error instanceof ApiError ? start.error.message : 'Det gick inte att starta samtalet.'}
            </p>
          )}
        </div>
        <footer className={styles.dialogFoot}>
          <Button onClick={() => ref.current?.close()}>Avbryt</Button>
          <Button variant="primary" type="submit" disabled={chosen.length === 0 || start.isPending}>
            {isGroup ? `Starta grupp med ${chosen.length}` : 'Starta samtal'}
          </Button>
        </footer>
      </form>
    </dialog>
  )
}
