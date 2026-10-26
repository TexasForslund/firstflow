import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import type { Person } from '../../api/classes'
import { ApiError } from '../../api/errors'
import { useCreatePlacement, useDeletePlacement, useWorkplaces, type Placement } from '../../api/placements'
import { Button, SelectField, TextField } from '../../components'
import { periodCountdown, periodText } from '../placements/period'
import styles from './Classes.module.css'

/** Panelen under elevraden: elevens placeringar och formuläret för att placera eleven. */
export function PlacementPanel({ student, placements }: { student: Person; placements: Placement[] }) {
  return (
    <div className={styles.placementPanel}>
      {placements.length > 0 && (
        <ul className={styles.placementList} aria-label={`Placeringar för ${student.name}`}>
          {placements.map((p) => (
            <PlacementItem key={p.id} placement={p} />
          ))}
        </ul>
      )}
      <AssignForm student={student} />
    </div>
  )
}

function PlacementItem({ placement }: { placement: Placement }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeletePlacement()
  const { start_date: start, end_date: end } = placement
  return (
    <li className={styles.placementItem}>
      <span className={styles.rowText}>
        <span className={styles.placementName}>{placement.workplace.name}</span>
        <span className={styles.meta}>
          {placement.supervisor.name} · {periodText(start, end)} · {periodCountdown(start, end)}
        </span>
      </span>
      <span className={styles.rowActions}>
        {confirming ? (
          <>
            <span className={styles.confirmText}>Ta bort placeringen?</span>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={remove.isPending}
              onClick={() => remove.mutate(placement.id)}
            >
              Ta bort
            </button>
            <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>
              Avbryt
            </button>
          </>
        ) : (
          <button type="button" className={styles.textButton} onClick={() => setConfirming(true)}>
            Ta bort
          </button>
        )}
      </span>
      {remove.isError && (
        <p className={styles.formError} role="alert">
          {remove.error.message}
        </p>
      )}
    </li>
  )
}

function AssignForm({ student }: { student: Person }) {
  const workplaces = useWorkplaces()
  const create = useCreatePlacement()
  const [workplaceId, setWorkplaceId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [done, setDone] = useState<string | null>(null)

  // Bara arbetsplatser med handledare går att placera på.
  const usable = (workplaces.data ?? []).filter((w) => w.supervisors.length > 0)
  const workplace = usable.find((w) => w.id === workplaceId)
  const supervisors = workplace?.supervisors ?? []
  const datesWrong = !!start && !!end && end < start

  function chooseWorkplace(id: string) {
    setWorkplaceId(id)
    const chosen = usable.find((w) => w.id === id)
    // Har arbetsplatsen bara en handledare väljs hen direkt.
    setSupervisorId(chosen?.supervisors.length === 1 ? chosen.supervisors[0].id : '')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!workplace || !supervisorId || datesWrong) return
    setDone(null)
    create.mutate(
      {
        student_id: student.id,
        workplace_id: workplace.id,
        supervisor_id: supervisorId,
        start_date: start,
        end_date: end,
      },
      {
        onSuccess: () => {
          setDone(`${student.name} är placerad på ${workplace.name}.`)
          setWorkplaceId('')
          setSupervisorId('')
          setStart('')
          setEnd('')
        },
      },
    )
  }

  if (workplaces.isPending) return <p className={styles.hint}>Hämtar arbetsplatser…</p>
  if (workplaces.isError) return <p className={styles.hint}>Arbetsplatserna gick inte att hämta.</p>
  if (usable.length === 0) {
    return (
      <p className={styles.hint}>
        Skolan har ingen arbetsplats med handledare än. Lägg till en under{' '}
        <Link to="/placements" className={styles.inlineLink}>
          Praktikplatser
        </Link>
        .
      </p>
    )
  }

  let error: string | null = null
  if (datesWrong) error = 'Slutdatum kan inte vara före startdatum.'
  else if (create.isError) {
    error =
      create.error instanceof ApiError && create.error.status === 409
        ? 'Eleven har redan en placering som överlappar perioden.'
        : create.error.message
  }

  return (
    <form className={styles.assignForm} onSubmit={submit} aria-label={`Placera ${student.name}`}>
      <p className={styles.assignTitle}>Ny placering</p>
      <div className={styles.formGrid}>
        <SelectField label="Arbetsplats" value={workplaceId} onChange={chooseWorkplace}>
          <option value="">Välj arbetsplats</option>
          {usable.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Handledare" value={supervisorId} onChange={setSupervisorId}>
          <option value="">{workplace ? 'Välj handledare' : 'Välj arbetsplats först'}</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Startdatum" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        <TextField
          label="Slutdatum"
          type="date"
          value={end}
          min={start || undefined}
          onChange={(e) => setEnd(e.target.value)}
          required
        />
      </div>
      <div className={styles.formActions}>
        <Button
          type="submit"
          variant="primary"
          disabled={!workplace || !supervisorId || !start || !end || datesWrong || create.isPending}
        >
          Placera eleven
        </Button>
      </div>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className={styles.formSuccess} role="status">
          {done}
        </p>
      )}
    </form>
  )
}
